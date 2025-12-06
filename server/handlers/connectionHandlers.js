const { getPlayerObjects } = require('../utils/roomUtils');

function registerConnectionHandlers(io, socket, rooms) {
    
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
            const player = room.players.splice(index, 1)[0];
            io.to(roomCode).emit("update-players", getPlayerObjects(roomCode, rooms));
            console.log(`${player.name} left room ${roomCode}`);

            // If host left, assign new host
            if (room.hostId === socket.id && room.players.length > 0) {
                room.hostId = room.players[0].id;
                console.log(`New host for room ${roomCode}: ${room.players[0].name}`);
            }

            // If no players left, delete room
            if (room.players.length === 0) delete rooms[roomCode];

            break;
            }
        }
    });

        
}

module.exports = { registerConnectionHandlers };