const {
    broadcastRoom,
    stateFor,
    startGraceTimer,
    scheduleRoomCleanup,
    findPlayerBySocket
} = require('../utils/roomUtils');
const {
    reassignHost,
    flagMissingClueGiver,
    removePlayer
} = require('../utils/playerUtils');

function registerConnectionHandlers(io, socket, rooms) {

    // Lightweight liveness probe. Mobile browsers freeze timers while
    // backgrounded, so a client can hold a socket it thinks is live but isn't.
    // The client calls this on wake-up; a missing ack tells it to reconnect.
    socket.on("sync-state", (roomCode, callback) => {
        if (typeof callback !== 'function') return;
        const room = rooms[roomCode];
        if (!room) return callback({ success: false, error: "Room not found" });
        if (!findPlayerBySocket(room, socket.id)) {
            return callback({ success: false, error: "Not in this room" });
        }
        callback({ success: true, gameState: stateFor(room, socket.id) });
    });

    // Explicit exit — distinct from a network drop, so no grace period
    socket.on("leave-room", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) {
                if (callback) callback({ success: true });
                return;
            }
            const player = findPlayerBySocket(room, socket.id);
            if (player) {
                socket.leave(roomCode);
                removePlayer(io, roomCode, rooms, player.name);
                if (rooms[roomCode] && !rooms[roomCode].players.some(p => p.connected)) {
                    scheduleRoomCleanup(roomCode, rooms);
                }
            }
            if (callback) callback({ success: true });
        } catch (err) {
            console.error(`Error in leave-room:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    socket.on("disconnect", (reason) => {
        try {
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const player = findPlayerBySocket(room, socket.id);
                if (!player) continue;

                player.connected = false;
                player.lastSeen = Date.now();
                console.log(
                    `${player.name} dropped from room ${roomCode} (${reason}) — ` +
                    `holding their spot (phase: ${room.gamePhase})`
                );

                // Tell everyone they're offline. Deliberately no phase change:
                // a brief drop must never interrupt anyone else's screen.
                broadcastRoom(io, roomCode, rooms);

                startGraceTimer(roomCode, player.name, () => {
                    onGraceExpired(io, roomCode, rooms, player.name);
                });

                if (!room.players.some(p => p.connected)) {
                    scheduleRoomCleanup(roomCode, rooms);
                }
                return;
            }
        } catch (err) {
            console.error(`Error in disconnect handler:`, err);
        }
    });
}

// The player has been gone long enough that we stop treating them as present.
// Even here we avoid pausing the room — we only do the minimum needed to keep
// the game able to move forward without them.
function onGraceExpired(io, roomCode, rooms, playerName) {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.name === playerName);
    if (!player || player.connected) return;

    // Nobody joined the game yet — just take them off the lobby list
    if (room.gamePhase === "in-lobby") {
        removePlayer(io, roomCode, rooms, playerName);
        return;
    }

    player.absent = true;
    console.log(`${playerName} marked absent in room ${roomCode}`);

    if (player.is_host) reassignHost(room, roomCode);
    flagMissingClueGiver(room, roomCode);

    broadcastRoom(io, roomCode, rooms);
}

module.exports = { registerConnectionHandlers };
