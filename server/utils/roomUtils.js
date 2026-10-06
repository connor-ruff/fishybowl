// How long a player can be gone before the game stops waiting on them.
// Mobile browsers drop sockets aggressively when backgrounded, so this needs
// to be generous — a player who returns inside the window sees nothing happen.
const GRACE_MS = parseInt(process.env.GRACE_MS) || 45 * 1000;

// Generate a random 4-character room code that isn't already in use
function generateRoomCode(rooms) {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms && rooms[code]);
  return code;
}

// Fisher-Yates shuffle
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Player lookup helpers ───

function findPlayerBySocket(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function isHostSocket(room, socketId) {
  const p = findPlayerBySocket(room, socketId);
  return !!(p && p.is_host);
}

// Collect every submitted word into a flat array
function buildBowl(room) {
  if (!room.playerLookup) return [];
  return Object.values(room.playerLookup).flatMap(p => p.submittedWords || []);
}

// ─── Per-socket state projection ───
// Clients get the room state minus things they shouldn't see: the undrawn word
// pile, other players' word submissions, and the current word (clue giver only).
function stateFor(room, socketId) {
  const viewer = findPlayerBySocket(room, socketId);
  const viewerName = viewer ? viewer.name : null;

  const out = { ...room };

  // Session ids are bearer tokens for "I am this player coming back" — they
  // must never be broadcast to the rest of the room.
  delete out.hostSessionId;

  out.players = room.players.map(p => ({
    name: p.name,
    is_host: !!p.is_host,
    connected: !!p.connected,
    absent: !!p.absent
  }));

  out.you = viewerName ? { name: viewerName, is_host: !!viewer.is_host } : null;

  if (room.playerLookup) {
    // Whitelisted rather than filtered, so adding a server-side field later
    // can't accidentally start shipping words or session ids to clients.
    out.playerLookup = {};
    for (const [name, info] of Object.entries(room.playerLookup)) {
      out.playerLookup[name] = {
        team: info.team,
        is_host: !!info.is_host,
        wordsSubmitted: !!info.wordsSubmitted,
        wordCount: (info.submittedWords || []).length
      };
    }
  }

  if (room.activeGame) {
    const { wordsRemaining, allWords, currentWord, ...rest } = room.activeGame;
    out.activeGame = {
      ...rest,
      wordsRemainingCount: wordsRemaining ? wordsRemaining.length : 0,
      currentWord: viewerName && room.activeGame.currentClueGiver === viewerName
        ? currentWord
        : null
    };
  }

  return out;
}

// Emit the projected state to every player in the room
function broadcastRoom(io, roomCode, rooms) {
  const room = rooms[roomCode];
  if (!room) return;
  for (const player of room.players) {
    if (player.connected && player.id) {
      io.to(player.id).emit("game-state-update", stateFor(room, player.id));
    }
  }
}

// ─── Turn timer management ───
const turnTimers = {};

function clearTurnTimer(roomCode) {
  if (turnTimers[roomCode]) {
    clearInterval(turnTimers[roomCode]);
    delete turnTimers[roomCode];
  }
}

// Freeze the countdown at its current value without ending the turn
function pauseTurnTimer(room, roomCode) {
  clearTurnTimer(roomCode);
  const g = room.activeGame;
  if (!g || !g.turnEndsAt) return;
  g.turnTimeLeft = Math.max(0, Math.ceil((g.turnEndsAt - Date.now()) / 1000));
  delete g.turnEndsAt;
}

function startTurnTimer(io, roomCode, rooms) {
  clearTurnTimer(roomCode);
  const room = rooms[roomCode];
  if (!room || !room.activeGame) return;
  // Record when the turn ends (wall-clock) so clients can count down locally
  room.activeGame.turnEndsAt = Date.now() + room.activeGame.turnTimeLeft * 1000;
  turnTimers[roomCode] = setInterval(() => {
    const r = rooms[roomCode];
    if (!r || r.gamePhase !== "turn-active" || !r.activeGame || !r.activeGame.turnEndsAt) {
      clearTurnTimer(roomCode);
      return;
    }
    if (Math.ceil((r.activeGame.turnEndsAt - Date.now()) / 1000) <= 0) {
      clearTurnTimer(roomCode);
      endTurn(io, roomCode, rooms);
    }
  }, 500);
}

// Close out the active turn and move to the turn-end summary
function endTurn(io, roomCode, rooms) {
  const room = rooms[roomCode];
  if (!room || !room.activeGame) return;
  const g = room.activeGame;

  clearTurnTimer(roomCode);
  g.turnTimeLeft = 0;
  delete g.turnEndsAt;

  g.turnHistory.push({
    round: g.currentRound,
    team: g.teamOrder[g.currentTeamIndex],
    clueGiver: g.turnClueGiver || g.currentClueGiver,
    wordsGuessed: g.wordsGuessedThisTurn.length,
    skips: g.skipsThisTurn
  });

  // Unguessed word goes back on top of the pile
  if (g.currentWord) {
    g.wordsRemaining.unshift(g.currentWord);
    g.currentWord = null;
  }

  room.waitingFor = null;
  room.gamePhase = "turn-end";
  broadcastRoom(io, roomCode, rooms);
}

// ─── Disconnect grace timers (per player) ───
const graceTimers = {};

function graceKey(roomCode, playerName) {
  return `${roomCode}::${playerName}`;
}

function startGraceTimer(roomCode, playerName, onExpire) {
  const key = graceKey(roomCode, playerName);
  cancelGraceTimer(roomCode, playerName);
  graceTimers[key] = setTimeout(() => {
    delete graceTimers[key];
    try {
      onExpire();
    } catch (err) {
      console.error(`Error in grace expiry for ${playerName}:`, err);
    }
  }, GRACE_MS);
}

function cancelGraceTimer(roomCode, playerName) {
  const key = graceKey(roomCode, playerName);
  if (graceTimers[key]) {
    clearTimeout(graceTimers[key]);
    delete graceTimers[key];
  }
}

function cancelAllGraceTimers(roomCode) {
  const prefix = `${roomCode}::`;
  for (const key of Object.keys(graceTimers)) {
    if (key.startsWith(prefix)) {
      clearTimeout(graceTimers[key]);
      delete graceTimers[key];
    }
  }
}

// ─── Room cleanup timers (delete room once everyone is gone) ───
const cleanupTimers = {};
const ROOM_CLEANUP_MS = 30 * 60 * 1000;

function scheduleRoomCleanup(roomCode, rooms) {
  cancelRoomCleanup(roomCode);
  cleanupTimers[roomCode] = setTimeout(() => {
    delete cleanupTimers[roomCode];
    const room = rooms[roomCode];
    if (!room) return;
    // Only delete if still nobody connected
    if (room.players.some(p => p.connected)) return;
    clearTurnTimer(roomCode);
    cancelAllGraceTimers(roomCode);
    console.log(`Room ${roomCode} deleted — empty for 30 minutes`);
    delete rooms[roomCode];
  }, ROOM_CLEANUP_MS);
}

function cancelRoomCleanup(roomCode) {
  if (cleanupTimers[roomCode]) {
    clearTimeout(cleanupTimers[roomCode]);
    delete cleanupTimers[roomCode];
  }
}

module.exports = {
  GRACE_MS,
  generateRoomCode,
  shuffleArray,
  findPlayerBySocket,
  isHostSocket,
  buildBowl,
  stateFor,
  broadcastRoom,
  clearTurnTimer,
  pauseTurnTimer,
  startTurnTimer,
  endTurn,
  startGraceTimer,
  cancelGraceTimer,
  cancelAllGraceTimers,
  scheduleRoomCleanup,
  cancelRoomCleanup
};
