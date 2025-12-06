// Generate a random 4-character room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Get player list from a room
function getPlayerObjects(roomCode, rooms) {
  return rooms[roomCode]?.players.map(p => ({ name: p.name, is_host: p.is_host })) || [];
}

module.exports = { 
    generateRoomCode, 
    getPlayerObjects 
};