const {
    shuffleArray,
    stateFor,
    broadcastRoom,
    findPlayerBySocket,
    isHostSocket,
    clearTurnTimer,
    startTurnTimer,
    cancelAllGraceTimers
} = require('../utils/roomUtils');
const {
    getCurrentClueGiver,
    flagMissingClueGiver,
    skipMissingClueGiver
} = require('../utils/playerUtils');

function registerGameHandlers(io, socket, rooms) {

    // Host stops waiting on a clue giver who dropped out
    socket.on("skip-waiting", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can do that" });
            }
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            skipMissingClueGiver(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in skip-waiting:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host clicks "Start Round" from the round-start screen
    socket.on("start-round", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can start the round" });
            }
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            room.gamePhase = "turn-ready";
            room.activeGame.currentClueGiver = getCurrentClueGiver(room);
            flagMissingClueGiver(room, roomCode);
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in start-round:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Clue giver clicks "Start" on the turn-ready screen
    socket.on("start-turn", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            const game = room.activeGame;
            const self = findPlayerBySocket(room, socket.id);
            if (!self) return callback({ success: false, error: "You're not in this room" });
            if (self.name !== game.currentClueGiver && !self.is_host) {
                return callback({ success: false, error: "Only the clue giver can start the turn" });
            }
            if (room.gamePhase !== "turn-ready") {
                return callback({ success: false, error: "Turn already started" });
            }

            if (game.wordsRemaining.length === 0) {
                room.gamePhase = "round-end";
                broadcastRoom(io, roomCode, rooms);
                return callback({ success: true, gameState: stateFor(room, socket.id) });
            }

            room.waitingFor = null;
            game.currentWord = game.wordsRemaining.pop();
            game.turnClueGiver = game.currentClueGiver;
            game.wordsGuessedThisTurn = [];
            game.skipsThisTurn = 0;
            game.turnTimeLeft = game.carriedTimeLeft || game.turnDuration;
            game.carriedTimeLeft = null;
            room.gamePhase = "turn-active";

            startTurnTimer(io, roomCode, rooms);
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in start-turn:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Clue giver presses "Got It!"
    socket.on("word-guessed", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            const game = room.activeGame;
            if (room.gamePhase !== "turn-active") {
                return callback({ success: false, error: "Turn is not active" });
            }
            if (!game.currentWord) return callback({ success: false, error: "No active word" });

            const self = findPlayerBySocket(room, socket.id);
            if (!self || (self.name !== game.currentClueGiver && !self.is_host)) {
                return callback({ success: false, error: "Only the clue giver can score a word" });
            }

            const teamName = game.teamOrder[game.currentTeamIndex];
            const roundIdx = game.currentRound - 1;
            game.scores[teamName][roundIdx] += 1;
            game.wordsCorrect[teamName][roundIdx] += 1;
            room.teamLookup[teamName].score += 1;

            game.wordsGuessedThisTurn.push(game.currentWord);

            // Pass the phone to the next teammate for the next word
            game.clueGiverRotation[teamName] += 1;
            game.currentClueGiver = getCurrentClueGiver(room);

            // Bowl empty — the round is over
            if (game.wordsRemaining.length === 0) {
                clearTurnTimer(roomCode);
                const timeLeft = game.turnEndsAt
                    ? Math.max(0, Math.ceil((game.turnEndsAt - Date.now()) / 1000))
                    : 0;
                game.turnHistory.push({
                    round: game.currentRound,
                    team: teamName,
                    clueGiver: game.turnClueGiver || game.currentClueGiver,
                    wordsGuessed: game.wordsGuessedThisTurn.length,
                    skips: game.skipsThisTurn
                });
                game.currentWord = null;
                delete game.turnEndsAt;

                // Rounds 1-2: this team keeps their leftover time next round
                game.carriedTimeLeft = (game.currentRound < 3 && timeLeft > 0) ? timeLeft : null;

                room.waitingFor = null;
                room.gamePhase = "round-end";
                broadcastRoom(io, roomCode, rooms);
                return callback({ success: true, gameState: stateFor(room, socket.id) });
            }

            game.currentWord = game.wordsRemaining.pop();
            flagMissingClueGiver(room, roomCode);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in word-guessed:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Clue giver presses "Skip"
    socket.on("skip-word", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            const game = room.activeGame;
            if (room.gamePhase !== "turn-active") {
                return callback({ success: false, error: "Turn is not active" });
            }
            if (!game.currentWord) return callback({ success: false, error: "No active word" });
            if (game.wordsRemaining.length === 0) {
                return callback({ success: false, error: "Only one word remaining" });
            }

            const self = findPlayerBySocket(room, socket.id);
            if (!self || (self.name !== game.currentClueGiver && !self.is_host)) {
                return callback({ success: false, error: "Only the clue giver can skip" });
            }

            const teamName = game.teamOrder[game.currentTeamIndex];
            const roundIdx = game.currentRound - 1;
            game.scores[teamName][roundIdx] -= 1;
            game.skipPenalties[teamName][roundIdx] += 1;
            game.skipsThisTurn += 1;
            room.teamLookup[teamName].score -= 1;

            // Draw a different word first, then bury the skipped one
            const skippedWord = game.currentWord;
            game.currentWord = game.wordsRemaining.pop();
            const insertIdx = Math.floor(Math.random() * (game.wordsRemaining.length + 1));
            game.wordsRemaining.splice(insertIdx, 0, skippedWord);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in skip-word:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host nudges a team's total score
    socket.on("adjust-score", (roomCode, teamName, delta, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can adjust scores" });
            }
            if (!room.activeGame?.hostAdjustments?.hasOwnProperty(teamName)) {
                return callback({ success: false, error: "Unknown team" });
            }

            const amount = delta > 0 ? 1 : -1;
            room.activeGame.hostAdjustments[teamName] += amount;
            room.teamLookup[teamName].score += amount;

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in adjust-score:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host advances past the turn summary
    socket.on("next-turn", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can continue" });
            }
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            const game = room.activeGame;

            // Rotate the clue giver for the team that just played, then hand off
            game.clueGiverRotation[game.teamOrder[game.currentTeamIndex]] += 1;
            game.currentTeamIndex = (game.currentTeamIndex + 1) % game.teamOrder.length;
            game.currentClueGiver = getCurrentClueGiver(room);
            game.currentWord = null;
            game.wordsGuessedThisTurn = [];
            game.skipsThisTurn = 0;
            game.turnTimeLeft = game.turnDuration;

            room.gamePhase = "turn-ready";
            flagMissingClueGiver(room, roomCode);
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in next-turn:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host starts the next round
    socket.on("next-round", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can continue" });
            }
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            const game = room.activeGame;

            if (game.currentRound >= 3) {
                clearTurnTimer(roomCode);
                room.waitingFor = null;
                room.gamePhase = "game-over";
                broadcastRoom(io, roomCode, rooms);
                return callback({ success: true, gameState: stateFor(room, socket.id) });
            }

            const carriedTime = game.carriedTimeLeft;

            // Advance the clue giver for whoever was playing when the round ended
            game.clueGiverRotation[game.teamOrder[game.currentTeamIndex]] += 1;

            game.currentRound += 1;
            game.wordsRemaining = shuffleArray(game.allWords);

            // Cleared the bowl with time left? Same team continues. Otherwise rotate.
            if (!carriedTime) {
                game.currentTeamIndex = (game.currentTeamIndex + 1) % game.teamOrder.length;
            }
            game.currentClueGiver = getCurrentClueGiver(room);
            game.currentWord = null;
            game.wordsGuessedThisTurn = [];
            game.skipsThisTurn = 0;

            room.gamePhase = "round-start";
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in next-round:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host ends the game early
    socket.on("end-game", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can end the game" });
            }
            if (!room.activeGame) return callback({ success: false, error: "No game in progress" });

            clearTurnTimer(roomCode);
            room.waitingFor = null;
            room.gamePhase = "game-over";
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in end-game:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Play again — back to the lobby with whoever is still here
    socket.on("play-again", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can restart" });
            }

            clearTurnTimer(roomCode);
            cancelAllGraceTimers(roomCode);

            // Players who never came back don't carry into the next game
            room.players = room.players.filter(p => !p.absent);

            delete room.activeGame;
            delete room.gameConfig;
            delete room.playerLookup;
            delete room.teamLookup;
            delete room.wordList;
            room.gamePhase = "in-lobby";
            room.waitingFor = null;

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in play-again:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });
}

module.exports = { registerGameHandlers };
