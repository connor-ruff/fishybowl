const { clearTurnTimer, scheduleRoomCleanup, cancelRoomCleanup } = require('../utils/roomUtils');

// Phases where the game is actively in progress
const GAMEPLAY_PHASES = [
    "collecting-words", "round-start", "turn-ready",
    "turn-active", "turn-end", "round-end", "game-over"
];

function registerConnectionHandlers(io, socket, rooms) {

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const player = room.players.find(p => p.id === socket.id);
            if (!player) continue;

            player.connected = false;
            console.log(`${player.name} disconnected from room ${roomCode} (phase: ${room.gamePhase})`);

            // If ALL players are now disconnected, schedule room cleanup
            const anyConnected = room.players.some(p => p.connected);
            if (!anyConnected) {
                console.log(`All players disconnected from room ${roomCode} — scheduling cleanup`);
                scheduleRoomCleanup(roomCode, rooms);
                break;
            }

            // Decide whether to pause based on current phase
            if (room.activeGame) {
                const phase = room.gamePhase;

                // At round boundaries: pause if anyone disconnects
                if (phase === "round-start") {
                    room.pausedGamePhase = phase;
                    room.gamePhase = "paused";
                    console.log(`Game paused in room ${roomCode} — ${player.name} disconnected at round start`);
                }
                // Mid-round: only pause if the clue giver disconnects
                else if (["turn-ready", "turn-active"].includes(phase) && player.name === room.activeGame.currentClueGiver) {
                    clearTurnTimer(roomCode);
                    room.pausedGamePhase = phase;
                    room.gamePhase = "paused";
                    console.log(`Game paused in room ${roomCode} — clue giver ${player.name} disconnected`);
                }
                // Other phases (turn-end, round-end, etc.): game continues
            }

            // Host reassignment if disconnected player was host
            if (player.is_host) {
                const newHost = room.players.find(p => p.connected);
                if (newHost) {
                    player.is_host = false;
                    newHost.is_host = true;
                    room.hostId = newHost.id;
                    if (room.hostSessionId) {
                        room.hostSessionId = newHost.sessionId;
                    }
                    console.log(`New host for room ${roomCode}: ${newHost.name}`);
                }
            }

            // Broadcast updated state to remaining players
            io.to(roomCode).emit("game-state-update", room);
            break;
        }
    });
}

module.exports = { registerConnectionHandlers };
