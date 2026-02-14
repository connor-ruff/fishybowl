function LobbyScreen({
  gameState,
  setGameState,
  error,
  setError,
  handleStartGame
}) {
  return (
    <div className="page">
      <div className="card card-center">
        <h1 className="title title-sm">Room: {gameState.clientState.roomCode}</h1>
        <p className="subtitle">Playing as {gameState.clientState.playerName}</p>

        <ul className="player-list">
          {gameState.serverState.players.map((p) => (
            <li key={p.name}>
              <span>{p.name}</span>
              {p.is_host && <span className="host-badge">Host</span>}
            </li>
          ))}
        </ul>

        {gameState.clientState.playerIsHost ? (
          <button className="btn-primary" onClick={handleStartGame}>
            Start Game
          </button>
        ) : (
          <p className="muted text-center">Waiting for host to start...</p>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

export default LobbyScreen;
