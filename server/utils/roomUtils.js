// Generate a random 4-character room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Get player list from a room
function getPlayerObjects(roomCode, rooms) {
  return rooms[roomCode]?.players.map(p => ({ name: p.name, is_host: p.is_host })) || [];
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

// Extract word list object into a plain array
function getWordArray(room) {
  const words = [];
  for (let i = 0; i < room.wordList.numberOfWords; i++) {
    words.push(room.wordList[i]);
  }
  return words;
}

// ─── Turn timer management (shared across handlers) ───
const turnTimers = {};

function clearTurnTimer(roomCode) {
    if (turnTimers[roomCode]) {
        clearInterval(turnTimers[roomCode]);
        delete turnTimers[roomCode];
    }
}

function startTurnTimer(io, roomCode, rooms) {
    clearTurnTimer(roomCode);
    const r = rooms[roomCode];
    if (!r || !r.activeGame) return;
    // Record when the turn ends (wall-clock) so clients can compute countdown locally
    r.activeGame.turnEndsAt = Date.now() + r.activeGame.turnTimeLeft * 1000;
    turnTimers[roomCode] = setInterval(() => {
        const r = rooms[roomCode];
        if (!r || r.gamePhase !== "turn-active") {
            clearTurnTimer(roomCode);
            return;
        }
        const remaining = Math.ceil((r.activeGame.turnEndsAt - Date.now()) / 1000);
        if (remaining <= 0) {
            clearTurnTimer(roomCode);
            const g = r.activeGame;
            g.turnTimeLeft = 0;
            g.turnHistory.push({
                round: g.currentRound,
                team: g.teamOrder[g.currentTeamIndex],
                clueGiver: g.currentClueGiver,
                wordsGuessed: g.wordsGuessedThisTurn.length,
                skips: g.skipsThisTurn
            });
            if (g.currentWord) {
                g.wordsRemaining.unshift(g.currentWord);
                g.currentWord = null;
            }
            r.gamePhase = "turn-end";
            io.to(roomCode).emit("game-state-update", r);
        }
    }, 1000);
}

// ─── Room cleanup timers (delete room when all players disconnect) ───
const cleanupTimers = {};

function scheduleRoomCleanup(roomCode, rooms) {
    cancelRoomCleanup(roomCode);
    cleanupTimers[roomCode] = setTimeout(() => {
        if (rooms[roomCode]) {
            clearTurnTimer(roomCode);
            console.log(`Room ${roomCode} deleted — all players disconnected for 5 minutes`);
            delete rooms[roomCode];
        }
        delete cleanupTimers[roomCode];
    }, 5 * 60 * 1000);
}

function cancelRoomCleanup(roomCode) {
    if (cleanupTimers[roomCode]) {
        clearTimeout(cleanupTimers[roomCode]);
        delete cleanupTimers[roomCode];
    }
}

module.exports = {
    generateRoomCode,
    getPlayerObjects,
    shuffleArray,
    getWordArray,
    clearTurnTimer,
    startTurnTimer,
    scheduleRoomCleanup,
    cancelRoomCleanup
};