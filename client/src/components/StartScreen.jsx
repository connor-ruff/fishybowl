function StartScreen({
  gameState,
  setGameState,
  error,
  setError,
  handleCreateRoom,
   handleJoinRoom
}) {
  return (
    <div className="page">
      <div className="card">
        <h1 className="title">Fishybowl</h1>
        <p className="subtitle">The party word-guessing game</p>

        <input
          className="themed-input"
          placeholder="Your name"
          value={gameState?.clientState?.playerName || ""}
          onChange={(e) => setGameState(prev => ({ ...prev, clientState: { ...prev.clientState, playerName: e.target.value } }))}
        />

        <button className="btn-primary" onClick={handleCreateRoom}>Create Room</button>

        <div className="start-divider">
          <span>or join an existing room</span>
        </div>

        <div className="start-join-row">
          <input
            className="themed-input"
            placeholder="Room code"
            value={gameState?.clientState?.roomCode || ""}
            onChange={(e) => setGameState(prev => ({ ...prev, clientState: { ...prev.clientState, roomCode: e.target.value.toUpperCase() } }))}
          />
          <button className="btn-secondary" onClick={() => handleJoinRoom(gameState?.clientState?.roomCode)}>
            Join Room
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

export default StartScreen;
