const { generateRoomCode, getPlayerObjects, shuffleArray, getWordArray, startTurnTimer } = require('../utils/roomUtils');

function registerRoomHandlers(io, socket, rooms) {


    // Player creates a room
    socket.on("create-room", (playerName, callback) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, is_host: true }],
            hostId: socket.id,
            gamePhase: "in-lobby"
        };
        socket.join(roomCode);
        console.log(`${playerName} created room ${roomCode}`);
        console.log("Initial room state:\n", rooms[roomCode]);
        callback({ success: true, roomCode, gameState: rooms[roomCode] });
    });


    // Player joins a room (or rejoins after disconnect)
    socket.on("join-room", (data, callback) => {
        const { roomCode, playerName } = data;
        const room = rooms[roomCode];
        if (!room) {
            callback({ success: false, error: "Room not found" });
            return;
        }

        // Check for rejoin — a disconnected player with the same name
        const disconnectedPlayer = room.players.find(p => p.name === playerName && p.connected === false);
        if (disconnectedPlayer) {
            // Rejoin: update socket ID, mark connected, join the Socket.IO room
            disconnectedPlayer.id = socket.id;
            disconnectedPlayer.connected = true;
            socket.join(roomCode);
            console.log(`${playerName} rejoined room ${roomCode}`);

            // Check if all players are now connected
            const allConnected = room.players.every(p => p.connected !== false);
            if (allConnected && room.gamePhase === "paused") {
                room.gamePhase = room.pausedGamePhase;
                delete room.pausedGamePhase;
                console.log(`Game resumed in room ${roomCode} (phase: ${room.gamePhase})`);

                // Restart the turn timer if we were mid-turn
                if (room.gamePhase === "turn-active") {
                    startTurnTimer(io, roomCode, rooms);
                }
            }

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

        room.players.push({ id: socket.id, name: playerName, is_host: false, connected: true });
        socket.join(roomCode);
        console.log(`${playerName} joined room ${roomCode}`);

        // Notify all players in room about updated player list
        io.to(roomCode).emit("update-players", rooms[roomCode]);

        callback({ success: true, roomCode, gameState: rooms[roomCode] });
    });



    // Host starts the game
    socket.on("start-game", (roomCode, callback) => {
        console.log(`Game started in room ${roomCode}`);
        if (rooms[roomCode]) {
            rooms[roomCode].gamePhase = "pre-game-configs";
        }
        io.to(roomCode).emit("game-started", rooms[roomCode]);
        callback({ success: true, roomCode, gameState: rooms[roomCode] });
    });

    // Host submits game configuration
    socket.on("submit-game-config", (roomCode, config, callback) => {

        console.log(`Received game configuration for room ${roomCode}:\n`, config);

        rooms[roomCode].gameConfig = config;
        rooms[roomCode].playerLookup = {};
        rooms[roomCode].teamLookup = {};
        rooms[roomCode].gamePhase = "collecting-words";
        rooms[roomCode].wordList = { "numberOfWords": 0 }; // Initialize empty word list

        // Loop through players key in config
        let totalPlayers = 0;
        for (let i = 0; i < config.teams.length; i++) {
            let teamName = config.teams[i].name;
            let playersArray = config.teams[i].players;

            for (let j = 0; j < playersArray.length; j++) {

                totalPlayers += 1;
                let player_id = null;
                let is_host = false;
                // Find player in current state object 
                for (let k = 0; k < rooms[roomCode].players.length; k++) {
                    if (rooms[roomCode].players[k].name === playersArray[j]) {
                        // Assign player id and is_host status
                        player_id = rooms[roomCode].players[k].id;
                        is_host = rooms[roomCode].players[k].is_host;
                        break;
                    }
                }

                rooms[roomCode].playerLookup[playersArray[j]] = {
                    "id": player_id, 
                    "is_host": is_host,
                    "team": teamName,
                    "wordsSubmitted": false
                };

                // check if teamName is already in teamLookup
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
    });

    // Player submits their words 
    socket.on("submit-words", (roomCode, playerName, words, callback) => {

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

            // Update count of players who have submitted words
            let count = 0;
            for (const pname in rooms[roomCode].playerLookup) {
                if (rooms[roomCode].playerLookup[pname].wordsSubmitted) {
                    count += 1;
                }
            }
            rooms[roomCode].gameConfig.numPlayersWithSubmittedWords = count;

            console.log(`Updated playerLookup for room ${roomCode}:\n`, rooms[roomCode].playerLookup);
        };
        callback({ success: true, roomCode, gameState: rooms[roomCode] });

        // Check if all players have submitted words
        if (rooms[roomCode].gameConfig.numPlayersWithSubmittedWords >= rooms[roomCode].gameConfig.numPlayers) {
            console.log(`All players have submitted words in room ${roomCode}. Initializing game.`);

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
    });


}

module.exports = { registerRoomHandlers };