// import generateRoomCode from utils
const { generateRoomCode, getPlayerObjects } = require('../utils/roomUtils');

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


    // Player joins a room
    socket.on("join-room", (data, callback) => {
        const { roomCode, playerName } = data;
        const room = rooms[roomCode];
        if (!room) {
            callback({ success: false, error: "Room not found" });
            return;
        }

        room.players.push({ id: socket.id, name: playerName, is_host: false });
        socket.join(roomCode);
        console.log(`${playerName} joined room ${roomCode}`);
        console.log("Updated room state:\n", rooms[roomCode]);

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
        rooms[roomCode].gamePhase = "unknown";

        // Loop through players key in config
        for (let i = 0; i < config.teams.length; i++) {
            let teamName = config.teams[i].name;
            let playersArray = config.teams[i].players;
            for (let j = 0; j < playersArray.length; j++) {

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
                    "team": teamName
                };

                // check if teamName is already in teamLookup
                if (!rooms[roomCode].teamLookup[teamName]) {
                    rooms[roomCode].teamLookup[teamName] = {
                        "members": [],
                        "score": 0
                    };
                }
                rooms[roomCode].teamLookup[teamName][playersArray[j]] = {
                    "id": player_id,
                    "is_host": is_host
                };
                rooms[roomCode].teamLookup[teamName]["members"].push(playersArray[j]);
            }
        }

        io.to(roomCode).emit("game-started", rooms[roomCode]);
        callback({ success: true, roomCode, gameState: rooms[roomCode] });
    });


}

module.exports = { registerRoomHandlers };