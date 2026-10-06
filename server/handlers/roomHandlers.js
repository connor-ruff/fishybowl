const {
    generateRoomCode,
    shuffleArray,
    buildBowl,
    stateFor,
    broadcastRoom,
    findPlayerBySocket,
    isHostSocket,
    cancelGraceTimer,
    cancelRoomCleanup,
    startTurnTimer
} = require('../utils/roomUtils');
const {
    getCurrentClueGiver,
    reassignHost,
    flagMissingClueGiver,
    removePlayer,
    recountWordSubmissions
} = require('../utils/playerUtils');

const MAX_NAME_LENGTH = 20;
const MAX_WORD_LENGTH = 100;

// Phases where someone who was never in the game can still be added
const JOINABLE_PHASES = ["in-lobby", "pre-game-configs"];

function cleanName(raw) {
    return typeof raw === 'string' ? raw.trim().slice(0, MAX_NAME_LENGTH) : '';
}

function registerRoomHandlers(io, socket, rooms) {

    // ─── Create a room ───
    socket.on("create-room", (data, callback) => {
        try {
            const playerName = cleanName(typeof data === 'string' ? data : data?.playerName);
            const sessionId = typeof data === 'string' ? null : data?.sessionId || null;

            if (!playerName) {
                return callback({ success: false, error: "Enter a name first" });
            }

            const roomCode = generateRoomCode(rooms);
            rooms[roomCode] = {
                code: roomCode,
                players: [{
                    id: socket.id,
                    name: playerName,
                    sessionId,
                    is_host: true,
                    connected: true,
                    absent: false,
                    lastSeen: Date.now()
                }],
                hostSessionId: sessionId,
                gamePhase: "in-lobby",
                waitingFor: null,
                createdAt: Date.now()
            };
            socket.join(roomCode);
            console.log(`${playerName} created room ${roomCode}`);
            callback({ success: true, roomCode, gameState: stateFor(rooms[roomCode], socket.id) });
        } catch (err) {
            console.error(`Error in create-room:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Join or rejoin a room ───
    socket.on("join-room", (data, callback) => {
        try {
            const roomCode = typeof data?.roomCode === 'string' ? data.roomCode.trim().toUpperCase() : '';
            const playerName = cleanName(data?.playerName);
            const sessionId = data?.sessionId || null;

            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!playerName) return callback({ success: false, error: "Enter a name first" });

            cancelRoomCleanup(roomCode);

            // Is this somebody coming back? Match on session first (survives a
            // name retype), then on an exact name that isn't currently live.
            let returning = sessionId
                ? room.players.find(p => p.sessionId === sessionId)
                : null;
            if (!returning) {
                returning = room.players.find(
                    p => p.name.toLowerCase() === playerName.toLowerCase() && !p.connected
                );
            }

            if (returning) {
                // Clean up any socket still registered under the old id
                if (returning.id && returning.id !== socket.id) {
                    const stale = io.sockets.sockets.get(returning.id);
                    if (stale) stale.leave(roomCode);
                }

                returning.id = socket.id;
                if (sessionId) returning.sessionId = sessionId;
                returning.connected = true;
                returning.absent = false;
                returning.lastSeen = Date.now();
                cancelGraceTimer(roomCode, returning.name);
                socket.join(roomCode);
                console.log(`${returning.name} rejoined room ${roomCode} (phase: ${room.gamePhase})`);

                if (room.playerLookup?.[returning.name]) {
                    room.playerLookup[returning.name].id = socket.id;
                    room.playerLookup[returning.name].sessionId = returning.sessionId;
                }

                // Room has no usable host (original left for good) — hand it over
                reassignHost(room, roomCode);

                // If the game was holding for this player, pick straight back up
                const wasWaitingOnThem = room.waitingFor === returning.name;
                flagMissingClueGiver(room, roomCode);
                if (wasWaitingOnThem && !room.waitingFor && room.gamePhase === "turn-active") {
                    startTurnTimer(io, roomCode, rooms);
                }

                broadcastRoom(io, roomCode, rooms);
                return callback({
                    success: true,
                    roomCode,
                    isRejoin: true,
                    gameState: stateFor(room, socket.id)
                });
            }

            // ─── New player ───
            if (!JOINABLE_PHASES.includes(room.gamePhase)) {
                return callback({
                    success: false,
                    error: "That game is already underway. Ask the host to add you after this game."
                });
            }

            const nameTaken = room.players.some(
                p => p.name.toLowerCase() === playerName.toLowerCase()
            );
            if (nameTaken) {
                return callback({
                    success: false,
                    error: `"${playerName}" is already taken in this room — pick a different name`
                });
            }

            room.players.push({
                id: socket.id,
                name: playerName,
                sessionId,
                is_host: false,
                connected: true,
                absent: false,
                lastSeen: Date.now()
            });
            socket.join(roomCode);
            console.log(`${playerName} joined room ${roomCode}`);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, roomCode, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in join-room:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Host removes a player (works in any phase) ───
    socket.on("remove-player", (roomCode, playerName, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can remove players" });
            }
            const self = findPlayerBySocket(room, socket.id);
            if (self.name === playerName) {
                return callback({ success: false, error: "You can't remove yourself" });
            }
            const result = removePlayer(io, roomCode, rooms, playerName);
            callback(result.success
                ? { success: true, gameState: stateFor(room, socket.id) }
                : result);
        } catch (err) {
            console.error(`Error in remove-player:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Host hands off host duties ───
    socket.on("transfer-host", (roomCode, playerName, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can transfer host" });
            }
            const target = room.players.find(p => p.name === playerName);
            if (!target) return callback({ success: false, error: "Player not in room" });

            room.players.forEach(p => { p.is_host = false; });
            target.is_host = true;
            room.hostSessionId = target.sessionId;
            if (room.playerLookup) {
                for (const [name, info] of Object.entries(room.playerLookup)) {
                    info.is_host = name === target.name;
                }
            }
            console.log(`Host of room ${roomCode} transferred to ${target.name}`);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in transfer-host:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Host moves the lobby into setup ───
    socket.on("start-game", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can start the game" });
            }
            if (room.players.length < 2) {
                return callback({ success: false, error: "Need at least 2 players" });
            }

            console.log(`Room ${roomCode} moving to setup`);
            room.gamePhase = "pre-game-configs";
            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, roomCode, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in start-game:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Host submits teams + word count ───
    socket.on("submit-game-config", (roomCode, config, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can configure the game" });
            }
            if (!config || !Array.isArray(config.teams) || config.teams.length < 2) {
                return callback({ success: false, error: "Need at least 2 teams" });
            }

            const roomNames = new Set(room.players.map(p => p.name));
            const assigned = [];
            for (const team of config.teams) {
                if (!team.players || team.players.length === 0) {
                    return callback({ success: false, error: `Team "${team.name}" has no players` });
                }
                for (const name of team.players) {
                    if (!roomNames.has(name)) {
                        return callback({ success: false, error: `${name} is no longer in the room` });
                    }
                    if (assigned.includes(name)) {
                        return callback({ success: false, error: `${name} is on two teams` });
                    }
                    assigned.push(name);
                }
            }

            const wordsPerPlayer = Math.min(10, Math.max(1, parseInt(config.wordsPerPlayer) || 3));

            // Anyone the host left unassigned is sitting this game out
            const sittingOut = room.players.filter(p => !assigned.includes(p.name));
            for (const player of sittingOut) {
                console.log(`${player.name} left unassigned — dropping from room ${roomCode}`);
                removePlayer(io, roomCode, rooms, player.name);
            }

            if (!rooms[roomCode]) return callback({ success: false, error: "Room closed" });

            room.gameConfig = {
                teams: config.teams.map(t => ({
                    name: cleanName(t.name) || "Team",
                    players: [...t.players]
                })),
                wordsPerPlayer
            };
            room.playerLookup = {};
            room.teamLookup = {};
            room.gamePhase = "collecting-words";
            room.waitingFor = null;

            for (const team of room.gameConfig.teams) {
                room.teamLookup[team.name] = { members: [], score: 0 };
                for (const name of team.players) {
                    const player = room.players.find(p => p.name === name);
                    room.playerLookup[name] = {
                        id: player?.id || null,
                        sessionId: player?.sessionId || null,
                        is_host: !!player?.is_host,
                        team: team.name,
                        wordsSubmitted: false,
                        submittedWords: []
                    };
                    room.teamLookup[team.name].members.push(name);
                }
            }

            recountWordSubmissions(room);
            console.log(`Room ${roomCode} collecting ${wordsPerPlayer} words from ${room.gameConfig.numPlayers} players`);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, roomCode, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in submit-game-config:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── A player submits their words ───
    socket.on("submit-words", (roomCode, playerName, words, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (room.gamePhase !== "collecting-words") {
                return callback({ success: false, error: "Not collecting words right now" });
            }

            // Trust the socket's identity over the name the client sent
            const self = findPlayerBySocket(room, socket.id);
            const name = self ? self.name : playerName;
            const entry = room.playerLookup?.[name];
            if (!entry) return callback({ success: false, error: "You're not in this game" });

            const cleaned = (Array.isArray(words) ? words : [])
                .map(w => (typeof w === 'string' ? w.trim().slice(0, MAX_WORD_LENGTH) : ''))
                .filter(w => w.length > 0);

            if (cleaned.length === 0) {
                return callback({ success: false, error: "Enter at least one word" });
            }

            // Overwrite rather than append — resubmitting after a reconnect
            // must not double up the bowl.
            entry.submittedWords = cleaned;
            entry.wordsSubmitted = true;
            recountWordSubmissions(room);
            console.log(`${name} submitted ${cleaned.length} words in room ${roomCode}`);

            const everyoneIn = Object.values(room.playerLookup).every(p => p.wordsSubmitted);
            if (everyoneIn) {
                initializeGame(room);
                console.log(`All words in for room ${roomCode} — starting game`);
            }

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, roomCode, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in submit-words:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });

    // ─── Host starts without the stragglers' words ───
    socket.on("force-start-game", (roomCode, callback) => {
        try {
            const room = rooms[roomCode];
            if (!room) return callback({ success: false, error: "Room not found" });
            if (!isHostSocket(room, socket.id)) {
                return callback({ success: false, error: "Only the host can do that" });
            }
            if (room.gamePhase !== "collecting-words") {
                return callback({ success: false, error: "Not collecting words right now" });
            }
            if (buildBowl(room).length < 2) {
                return callback({ success: false, error: "Need at least 2 words in the bowl to start" });
            }

            initializeGame(room);
            console.log(`Host force-started room ${roomCode} with ${room.activeGame.allWords.length} words`);

            broadcastRoom(io, roomCode, rooms);
            callback({ success: true, gameState: stateFor(room, socket.id) });
        } catch (err) {
            console.error(`Error in force-start-game:`, err);
            if (callback) callback({ success: false, error: "Server error" });
        }
    });
}

// Build the activeGame object and move the room to round 1.
// allWords is a snapshot so later joins/removals can't resize the bowl mid-game.
function initializeGame(room) {
    const teamNames = Object.keys(room.teamLookup).filter(
        t => room.teamLookup[t].members.length > 0
    );

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

    const allWords = buildBowl(room);

    room.activeGame = {
        currentRound: 1,
        rounds: [
            { name: "Describe It", description: "Use as many words as you want to describe the word or phrase. No acting, no gestures!" },
            { name: "Act It Out", description: "Act it out! No talking, no sounds allowed!" },
            { name: "One Word", description: "Say only ONE word as a clue. No gestures, no sounds!" }
        ],
        teamOrder: teamNames,
        currentTeamIndex: 0,
        clueGiverRotation,
        currentClueGiver: null,
        currentWord: null,
        allWords,
        wordsRemaining: shuffleArray(allWords),
        wordsGuessedThisTurn: [],
        skipsThisTurn: 0,
        turnHistory: [],
        turnDuration: 60,
        turnTimeLeft: 60,
        carriedTimeLeft: null,
        scores,
        wordsCorrect,
        skipPenalties,
        hostAdjustments
    };

    room.activeGame.currentClueGiver = getCurrentClueGiver(room);
    room.gamePhase = "round-start";
    room.waitingFor = null;
}

module.exports = { registerRoomHandlers, initializeGame };
