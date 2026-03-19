const { generateRoomCode, getPlayerObjects, shuffleArray, getWordArray, startTurnTimer, cancelRoomCleanup } = require('../utils/roomUtils');

function registerRoomHandlers(io, socket, rooms) {

    // Player creates a room
    socket.on("create-room", (data, callback) => {
        try {
        // Support both old format (plain string) and new format ({ playerName, sessionId })
        const playerName = typeof data === 'string' ? data : data.playerName;
        const sessionId = typeof data === 'string' ? null : data.sessionId;

        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, sessionId, is_host: true, connected: true }],
            hostId: socket.id,
            hostSessionId: sessionId,
            gamePhase: "in-lobby"
        };
        socket.join(roomCode);
        console.log(`${playerName} created room ${roomCode}`);
        callback({ success: true, roomCode, gameState: rooms[roomCode] });
        } catch (err) {
            console.error(`Error in create-room:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });


    // Player joins a room (or rejoins after disconnect)
    socket.on("join-room", (data, callback) => {
        try {
        const { roomCode, playerName, sessionId } = data;
        const room = rooms[roomCode];
        if (!room) {
            callback({ success: false, error: "Room not found" });
            return;
        }

        // Cancel any pending room cleanup since someone is joining
        cancelRoomCleanup(roomCode);

        // Check for rejoin — match by sessionId first, then by name
        let disconnectedPlayer = null;
        if (sessionId) {
            disconnectedPlayer = room.players.find(p => p.sessionId === sessionId && !p.connected);
        }
        if (!disconnectedPlayer) {
            disconnectedPlayer = room.players.find(p => p.name === playerName && !p.connected);
        }

        if (disconnectedPlayer) {
            // Rejoin: update socket ID & sessionId, mark connected
            disconnectedPlayer.id = socket.id;
            if (sessionId) disconnectedPlayer.sessionId = sessionId;
            disconnectedPlayer.connected = true;
            socket.join(roomCode);
            console.log(`${playerName} rejoined room ${roomCode}`);

            // If this player is host, update hostId
            if (disconnectedPlayer.is_host) {
                room.hostId = socket.id;
                if (sessionId) room.hostSessionId = sessionId;
            }

            // Broadcast updated state so everyone sees the player reconnected
            io.to(roomCode).emit("game-state-update", room);
            callback({
                success: true, roomCode, gameState: room,
                isRejoin: true, isHost: disconnectedPlayer.is_host
            });
            return;
        }

        // Normal join — only allowed during lobby
        if (room.gamePhase !== "in-lobby") {
            callback({ success: false, error: "Game already in progress" });
            return;
        }

        room.players.push({ id: socket.id, name: playerName, sessionId, is_host: false, connected: true });
        socket.join(roomCode);
        console.log(`${playerName} joined room ${roomCode}`);

        // Notify all players in room about updated player list
        io.to(roomCode).emit("update-players", rooms[roomCode]);

        callback({ success: true, roomCode, gameState: rooms[roomCode] });
        } catch (err) {
            console.error(`Error in join-room:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });



    // Host starts the game
    socket.on("start-game", (roomCode, callback) => {
        try {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const disconnected = room.players.filter(p => !p.connected);
        if (disconnected.length > 0) {
            return callback({ success: false, error: `Cannot start — ${disconnected.map(p => p.name).join(', ')} disconnected` });
        }

        console.log(`Game started in room ${roomCode}`);
        room.gamePhase = "pre-game-configs";
        io.to(roomCode).emit("game-started", room);
        callback({ success: true, roomCode, gameState: room });
        } catch (err) {
            console.error(`Error in start-game:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Host submits game configuration
    socket.on("submit-game-config", (roomCode, config, callback) => {
        try {
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });

        const disconnected = room.players.filter(p => !p.connected);
        if (disconnected.length > 0) {
            return callback({ success: false, error: `Cannot proceed — ${disconnected.map(p => p.name).join(', ')} disconnected` });
        }

        console.log(`Received game configuration for room ${roomCode}:\n`, config);

        // Validate every team has at least 1 player
        for (const team of config.teams) {
            if (!team.players || team.players.length === 0) {
                return callback({ success: false, error: `Team "${team.name}" has no players assigned` });
            }
        }

        rooms[roomCode].gameConfig = config;
        rooms[roomCode].playerLookup = {};
        rooms[roomCode].teamLookup = {};
        rooms[roomCode].gamePhase = "collecting-words";
        rooms[roomCode].wordList = { "numberOfWords": 0 };

        let totalPlayers = 0;
        for (let i = 0; i < config.teams.length; i++) {
            let teamName = config.teams[i].name;
            let playersArray = config.teams[i].players;

            for (let j = 0; j < playersArray.length; j++) {

                totalPlayers += 1;
                let player_id = null;
                let is_host = false;
                let playerSessionId = null;
                // Find player in current state object
                for (let k = 0; k < rooms[roomCode].players.length; k++) {
                    if (rooms[roomCode].players[k].name === playersArray[j]) {
                        player_id = rooms[roomCode].players[k].id;
                        is_host = rooms[roomCode].players[k].is_host;
                        playerSessionId = rooms[roomCode].players[k].sessionId;
                        break;
                    }
                }

                rooms[roomCode].playerLookup[playersArray[j]] = {
                    "id": player_id,
                    "sessionId": playerSessionId,
                    "is_host": is_host,
                    "team": teamName,
                    "wordsSubmitted": false
                };

                if (!rooms[roomCode].teamLookup[teamName]) {
                    rooms[roomCode].teamLookup[teamName] = {
                        "members": [],
                        "score": 0
                    };
                }
                rooms[roomCode].teamLookup[teamName]["members"].push(playersArray[j]);
            }
        }

        rooms[roomCode].gameConfig.numPlayers = totalPlayers;
        rooms[roomCode].gameConfig.numPlayersWithSubmittedWords = 0;


        io.to(roomCode).emit("game-started", rooms[roomCode]);
        callback({ success: true, roomCode, gameState: rooms[roomCode] });
        } catch (err) {
            console.error(`Error in submit-game-config:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // Player submits their words
    socket.on("submit-words", (roomCode, playerName, words, callback) => {
        try {
        console.log(`Received words from ${playerName} in room ${roomCode}:`, words);

        // Add words to word list
        let currentNumWords = rooms[roomCode].wordList ? rooms[roomCode].wordList.numberOfWords : 0;
        for (let i = 0; i < words.length; i++) {
            rooms[roomCode].wordList[currentNumWords + i] = words[i];
        }
        rooms[roomCode].wordList.numberOfWords = currentNumWords + words.length;

        if (rooms[roomCode] && rooms[roomCode].playerLookup[playerName]) {
            rooms[roomCode].playerLookup[playerName].submittedWords = words;
            rooms[roomCode].playerLookup[playerName].wordsSubmitted = true;

            // Count only connected players who need to submit words
            let submittedCount = 0;
            let connectedCount = 0;
            for (const pname in rooms[roomCode].playerLookup) {
                const pInfo = rooms[roomCode].playerLookup[pname];
                // Find matching player in players array to check connected status
                const playerObj = rooms[roomCode].players.find(p => p.name === pname);
                const isConnected = playerObj ? playerObj.connected : true;

                if (pInfo.wordsSubmitted) {
                    submittedCount += 1;
                }
                if (isConnected) {
                    connectedCount += 1;
                }
            }
            rooms[roomCode].gameConfig.numPlayersWithSubmittedWords = submittedCount;

            console.log(`Updated playerLookup for room ${roomCode}:\n`, rooms[roomCode].playerLookup);
        };
        callback({ success: true, roomCode, gameState: rooms[roomCode] });

        // Broadcast so waiting players see updated submission count
        io.to(roomCode).emit("game-state-update", rooms[roomCode]);

        // Check if all players have submitted words AND are connected
        const allSubmitted = Object.keys(rooms[roomCode].playerLookup).every(pname => {
            return rooms[roomCode].playerLookup[pname].wordsSubmitted;
        });
        const allConnected = rooms[roomCode].players.every(p => p.connected);

        if (allSubmitted && allConnected && rooms[roomCode].gameConfig.numPlayersWithSubmittedWords > 0) {
            console.log(`All connected players have submitted words in room ${roomCode}. Initializing game.`);

            const room = rooms[roomCode];
            const teamNames = Object.keys(room.teamLookup);
            const scores = {};
            const wordsCorrect = {};
            const skipPenalties = {};
            const hostAdjustments = {};
            const clueGiverRotation = {};
            teamNames.forEach(name => {
                scores[name] = [0, 0, 0];
                wordsCorrect[name] = [0, 0, 0];
                skipPenalties[name] = [0, 0, 0];
                hostAdjustments[name] = 0;
                clueGiverRotation[name] = 0;
            });

            room.activeGame = {
                currentRound: 1,
                rounds: [
                    { name: "Describe It", description: "Use as many words as you want to describe the word or phrase. No acting, no gestures!" },
                    { name: "Act It Out", description: "Act it out! No talking, no sounds allowed!" },
                    { name: "One Word", description: "Say only ONE word as a clue. No gestures, no sounds!" }
                ],
                teamOrder: teamNames,
                currentTeamIndex: 0,
                clueGiverRotation: clueGiverRotation,
                currentClueGiver: room.teamLookup[teamNames[0]].members[0],
                currentWord: null,
                wordsRemaining: shuffleArray(getWordArray(room)),
                wordsGuessedThisTurn: [],
                skipsThisTurn: 0,
                turnHistory: [],
                turnDuration: 60,
                turnTimeLeft: 60,
                carriedTimeLeft: null,
                scores: scores,
                wordsCorrect: wordsCorrect,
                skipPenalties: skipPenalties,
                hostAdjustments: hostAdjustments
            };

            room.gamePhase = "round-start";
            io.to(roomCode).emit("all-words-submitted", rooms[roomCode]);
        }
        } catch (err) {
            console.error(`Error in submit-words:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });


}

module.exports = { registerRoomHandlers };
