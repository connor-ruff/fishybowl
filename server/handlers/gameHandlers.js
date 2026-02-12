const { shuffleArray, getWordArray, clearTurnTimer, startTurnTimer } = require('../utils/roomUtils');

function getCurrentClueGiver(room) {
    const game = room.activeGame;
    const teamName = game.teamOrder[game.currentTeamIndex];
    const members = room.teamLookup[teamName].members;
    const idx = game.clueGiverRotation[teamName] % members.length;
    return members[idx];
}

function broadcastState(io, roomCode, rooms) {
    io.to(roomCode).emit("game-state-update", rooms[roomCode]);
}

function registerGameHandlers(io, socket, rooms) {

    // Host clicks "Start Round" from round-start screen
    socket.on("start-round", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        room.gamePhase = "turn-ready";
        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Clue giver clicks "Start" on turn-ready screen
    socket.on("start-turn", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;

        if (game.wordsRemaining.length === 0) {
            room.gamePhase = "round-end";
            broadcastState(io, roomCode, rooms);
            return callback({ success: true, gameState: room });
        }

        game.currentWord = game.wordsRemaining.pop();
        game.wordsGuessedThisTurn = [];
        game.skipsThisTurn = 0;
        game.turnTimeLeft = game.carriedTimeLeft || game.turnDuration;
        game.carriedTimeLeft = null;
        room.gamePhase = "turn-active";

        broadcastState(io, roomCode, rooms);
        startTurnTimer(io, roomCode, rooms);

        callback({ success: true, gameState: room });
    });

    // Clue giver presses "Got It!"
    socket.on("word-guessed", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;
        if (!game.currentWord) return callback({ success: false, error: "No active word" });

        // Score the point
        const teamName = game.teamOrder[game.currentTeamIndex];
        const roundIdx = game.currentRound - 1;
        game.scores[teamName][roundIdx] += 1;
        game.wordsCorrect[teamName][roundIdx] += 1;
        room.teamLookup[teamName].score += 1;

        game.wordsGuessedThisTurn.push(game.currentWord);

        // Rotate clue giver to the next teammate
        const teamName2 = game.teamOrder[game.currentTeamIndex];
        game.clueGiverRotation[teamName2] += 1;
        game.currentClueGiver = getCurrentClueGiver(room);

        // Draw next word or end round
        if (game.wordsRemaining.length === 0) {
            clearTurnTimer(roomCode);
            game.turnHistory.push({
                round: game.currentRound,
                team: game.teamOrder[game.currentTeamIndex],
                clueGiver: game.currentClueGiver,
                wordsGuessed: game.wordsGuessedThisTurn.length,
                skips: game.skipsThisTurn
            });
            game.currentWord = null;

            // For rounds 1-2, carry remaining time so this team continues into the next round
            if (game.currentRound < 3 && game.turnTimeLeft > 0) {
                game.carriedTimeLeft = game.turnTimeLeft;
            } else {
                game.carriedTimeLeft = null;
            }

            room.gamePhase = "round-end";
            broadcastState(io, roomCode, rooms);
            return callback({ success: true, gameState: room });
        }

        game.currentWord = game.wordsRemaining.pop();
        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Clue giver presses "Skip"
    socket.on("skip-word", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;
        if (!game.currentWord) return callback({ success: false, error: "No active word" });

        // Can't skip if this is the only word left
        if (game.wordsRemaining.length === 0) {
            return callback({ success: false, error: "Only one word remaining" });
        }

        // -1 point penalty for skipping
        const teamName = game.teamOrder[game.currentTeamIndex];
        const roundIdx = game.currentRound - 1;
        game.scores[teamName][roundIdx] -= 1;
        game.skipPenalties[teamName][roundIdx] += 1;
        game.skipsThisTurn += 1;
        room.teamLookup[teamName].score -= 1;

        // Draw a different word first, then put the skipped word back
        const skippedWord = game.currentWord;
        game.currentWord = game.wordsRemaining.pop();
        const insertIdx = Math.floor(Math.random() * (game.wordsRemaining.length + 1));
        game.wordsRemaining.splice(insertIdx, 0, skippedWord);

        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Host adjusts a team's total score (tracked separately from round scores)
    socket.on("adjust-score", (roomCode, teamName, delta, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;
        game.hostAdjustments[teamName] += delta;
        room.teamLookup[teamName].score += delta;

        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Advance to next turn after turn-end
    socket.on("next-turn", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;

        // Rotate clue giver for the team that just played
        const currentTeam = game.teamOrder[game.currentTeamIndex];
        game.clueGiverRotation[currentTeam] += 1;

        // Advance to next team
        game.currentTeamIndex = (game.currentTeamIndex + 1) % game.teamOrder.length;

        // Set up next clue giver
        game.currentClueGiver = getCurrentClueGiver(room);
        game.currentWord = null;
        game.wordsGuessedThisTurn = [];

        room.gamePhase = "turn-ready";
        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Start next round after round-end
    socket.on("next-round", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const game = room.activeGame;

        if (game.currentRound >= 3) {
            room.gamePhase = "game-over";
            broadcastState(io, roomCode, rooms);
            return callback({ success: true, gameState: room });
        }

        const carriedTime = game.carriedTimeLeft;

        // Advance clue giver for the team that was playing when round ended
        const lastTeam = game.teamOrder[game.currentTeamIndex];
        game.clueGiverRotation[lastTeam] += 1;

        game.currentRound += 1;
        game.wordsRemaining = shuffleArray(getWordArray(room));

        if (carriedTime) {
            // Same team continues with their leftover time
            game.currentClueGiver = getCurrentClueGiver(room);
        } else {
            // Normal rotation: next team starts the new round
            game.currentTeamIndex = (game.currentTeamIndex + 1) % game.teamOrder.length;
            game.currentClueGiver = getCurrentClueGiver(room);
        }

        game.currentWord = null;
        game.wordsGuessedThisTurn = [];

        room.gamePhase = "round-start";
        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });

    // Play again — reset to lobby
    socket.on("play-again", (roomCode, callback) => {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        clearTurnTimer(roomCode);

        delete room.activeGame;
        delete room.gameConfig;
        delete room.playerLookup;
        delete room.teamLookup;
        delete room.wordList;
        room.gamePhase = "in-lobby";

        broadcastState(io, roomCode, rooms);
        callback({ success: true, gameState: room });
    });
}

module.exports = { registerGameHandlers };
