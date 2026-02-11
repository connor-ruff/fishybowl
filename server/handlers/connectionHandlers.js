const { getPlayerObjects, clearTurnTimer } = require('../utils/roomUtils');

const PAUSABLE_PHASES = [
    "collecting-words", "round-start", "turn-ready",
    "turn-active", "turn-end", "round-end", "game-over"
];

function registerConnectionHandlers(io, socket, rooms) {

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index === -1) continue;

            const player = room.players[index];
            console.log(`${player.name} disconnected from room ${roomCode} (phase: ${room.gamePhase})`);

            // During active gameplay, pause instead of removing
            if (PAUSABLE_PHASES.includes(room.gamePhase)) {
                player.connected = false;

                // Freeze the timer if a turn was active
                clearTurnTimer(roomCode);

                // Save the phase we were in and pause
                room.pausedGamePhase = room.gamePhase;
                room.gamePhase = "paused";

                console.log(`Game paused in room ${roomCode} — waiting for ${player.name} to rejoin`);
                io.to(roomCode).emit("game-state-update", room);
                break;
            }

            // Pre-game phases: remove player as before
            room.players.splice(index, 1);
            io.to(roomCode).emit("update-players", getPlayerObjects(roomCode, rooms));

            // If host left, assign new host
            if (room.hostId === socket.id && room.players.length > 0) {
                room.hostId = room.players[0].id;
                room.players[0].is_host = true;
                console.log(`New host for room ${roomCode}: ${room.players[0].name}`);
            }

            // If no players left, delete room
            if (room.players.length === 0) delete rooms[roomCode];

            break;
        }
    });
}

module.exports = { registerConnectionHandlers };
