function StartScreen({ 
  gameState, 
  setGameState, 
  error, 
  setError,
  handleCreateRoom,
   handleJoinRoom
}) {
  return (

    <div style={{ padding: 40 }}>
      <h1>Fishybowl</h1>
      <input
        placeholder="Your name"
        value={gameState?.clientState?.playerName || ""}
        onChange={(e) => setGameState(prev => ({ ...prev, clientState: { ...prev.clientState, playerName: e.target.value } }))}
      />
      <div style={{ marginTop: 10 }}>
        <button onClick={handleCreateRoom}>Create Room</button>
      </div>
      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Room code"
          value={gameState?.clientState?.roomCode || ""}
          onChange={(e) => setGameState(prev => ({ ...prev, clientState: { ...prev.clientState, roomCode: e.target.value.toUpperCase() } }))}
        />
        <button onClick={() => handleJoinRoom(gameState?.clientState?.roomCode)} style={{ marginLeft: 10 }}>
          Join Room
        </button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default StartScreen;
