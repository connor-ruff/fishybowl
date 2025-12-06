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

}

module.exports = { registerRoomHandlers };