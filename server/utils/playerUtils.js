const {
  broadcastRoom,
  cancelGraceTimer,
  pauseTurnTimer,
  endTurn
} = require('./roomUtils');

// Pick the clue giver for the current team, skipping players who have gone
// absent. The rotation counter isn't advanced for skipped players, so they get
// their turn once they're back.
function getCurrentClueGiver(room) {
  const game = room.activeGame;
  if (!game) return null;
  const teamName = game.teamOrder[game.currentTeamIndex];
  const team = room.teamLookup[teamName];
  if (!team || team.members.length === 0) return null;

  const members = team.members;
  const start = game.clueGiverRotation[teamName] % members.length;
  for (let i = 0; i < members.length; i++) {
    const name = members[(start + i) % members.length];
    const player = room.players.find(p => p.name === name);
    if (player && !player.absent) return name;
  }
  // Whole team is absent — fall back to the scheduled player
  return members[start];
}

// Move host duties to someone who can actually act. Prefers a connected
// player, then any player still in the game.
function reassignHost(room, roomCode) {
  const current = room.players.find(p => p.is_host);
  if (current && current.connected && !current.absent) return false;

  const candidate =
    room.players.find(p => p.connected && !p.absent) ||
    room.players.find(p => !p.absent);

  if (!candidate || candidate === current) return false;

  room.players.forEach(p => { p.is_host = false; });
  candidate.is_host = true;
  room.hostSessionId = candidate.sessionId;
  if (room.playerLookup) {
    for (const [name, info] of Object.entries(room.playerLookup)) {
      info.is_host = name === candidate.name;
    }
  }
  console.log(`Host for room ${roomCode} is now ${candidate.name}`);
  return true;
}

// If the current clue giver has gone absent, freeze the turn and record who
// we're waiting on. The host gets a "skip them" escape hatch in the UI.
// Returns true if the room state changed.
function flagMissingClueGiver(room, roomCode) {
  const game = room.activeGame;
  if (!game) return false;
  if (!["turn-ready", "turn-active"].includes(room.gamePhase)) return false;

  const giver = room.players.find(p => p.name === game.currentClueGiver);
  const missing = !giver || giver.absent;

  if (missing && room.waitingFor !== game.currentClueGiver) {
    room.waitingFor = game.currentClueGiver;
    pauseTurnTimer(room, roomCode);
    console.log(`Room ${roomCode} waiting on clue giver ${room.waitingFor}`);
    return true;
  }
  if (!missing && room.waitingFor) {
    room.waitingFor = null;
    return true;
  }
  return false;
}

// Host override: stop waiting on the absent clue giver and keep the game moving.
function skipMissingClueGiver(io, roomCode, rooms) {
  const room = rooms[roomCode];
  const game = room.activeGame;
  if (!game) return;

  room.waitingFor = null;

  if (room.gamePhase === "turn-active") {
    // Mid-turn: end it where it stands, points already scored are kept
    endTurn(io, roomCode, rooms);
    return;
  }

  // turn-ready: hand the turn to the next available teammate, or the next team
  const teamName = game.teamOrder[game.currentTeamIndex];
  const members = room.teamLookup[teamName].members;
  const hasAvailable = members.some(name => {
    const p = room.players.find(x => x.name === name);
    return p && !p.absent;
  });

  if (hasAvailable) {
    game.clueGiverRotation[teamName] += 1;
  } else {
    game.currentTeamIndex = (game.currentTeamIndex + 1) % game.teamOrder.length;
  }

  game.currentClueGiver = getCurrentClueGiver(room);
  game.currentWord = null;
  game.wordsGuessedThisTurn = [];
  game.turnTimeLeft = game.turnDuration;

  flagMissingClueGiver(room, roomCode);
  broadcastRoom(io, roomCode, rooms);
}

// Fully remove a player from a room, in any phase. Their already-submitted
// words stay in the bowl — the pile shouldn't shrink mid-game.
function removePlayer(io, roomCode, rooms, playerName) {
  const room = rooms[roomCode];
  if (!room) return { success: false, error: "Room not found" };

  const idx = room.players.findIndex(p => p.name === playerName);
  if (idx === -1) return { success: false, error: "Player not in room" };

  const [removed] = room.players.splice(idx, 1);
  cancelGraceTimer(roomCode, playerName);
  console.log(`${playerName} removed from room ${roomCode}`);

  if (room.playerLookup) delete room.playerLookup[playerName];

  if (room.gameConfig && room.gameConfig.teams) {
    room.gameConfig.teams.forEach(team => {
      team.players = team.players.filter(n => n !== playerName);
    });
  }

  if (room.teamLookup) {
    for (const team of Object.values(room.teamLookup)) {
      team.members = team.members.filter(n => n !== playerName);
    }
  }

  const game = room.activeGame;
  if (game) {
    // Drop any team that just lost its last member
    const emptyTeams = game.teamOrder.filter(
      t => !room.teamLookup[t] || room.teamLookup[t].members.length === 0
    );
    if (emptyTeams.length > 0) {
      game.teamOrder = game.teamOrder.filter(t => !emptyTeams.includes(t));
    }

    if (game.teamOrder.length === 0) {
      room.gamePhase = "game-over";
      room.waitingFor = null;
    } else {
      if (game.currentTeamIndex >= game.teamOrder.length) game.currentTeamIndex = 0;
      if (room.waitingFor === playerName) room.waitingFor = null;
      if (game.currentClueGiver === playerName) {
        game.currentClueGiver = getCurrentClueGiver(room);
        if (room.gamePhase === "turn-active") {
          endTurn(io, roomCode, rooms);
        }
      }
    }
  }

  if (removed.is_host) {
    removed.is_host = false;
    reassignHost(room, roomCode);
  }

  if (room.gameConfig) recountWordSubmissions(room);

  // Tell the removed client so it can reset instead of hanging
  if (removed.id) {
    io.to(removed.id).emit("removed-from-room", { roomCode });
  }

  broadcastRoom(io, roomCode, rooms);
  return { success: true, removed: removed.name };
}

// Keep the "x of y submitted" counters honest as players join/leave
function recountWordSubmissions(room) {
  if (!room.gameConfig || !room.playerLookup) return;
  const names = Object.keys(room.playerLookup);
  room.gameConfig.numPlayers = names.length;
  room.gameConfig.numPlayersWithSubmittedWords = names.filter(
    n => room.playerLookup[n].wordsSubmitted
  ).length;
}

module.exports = {
  getCurrentClueGiver,
  reassignHost,
  flagMissingClueGiver,
  skipMissingClueGiver,
  removePlayer,
  recountWordSubmissions
};
