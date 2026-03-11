function LobbyScreen({
  gameState,
  setGameState,
  error,
  setError,
  handleStartGame
}) {
  const connectedPlayers = gameState.serverState.players.filter(p => p.connected !== false);
  const connectedCount = connectedPlayers.length;

  return (
    <div className="page">
      <div className="card card-center">
        <div className="player-header">
          <span>Room: <strong>{gameState.clientState.roomCode}</strong></span>
          <span>{gameState.clientState.playerName}</span>
        </div>

        <ul className="player-list">
          {gameState.serverState.players.map((p) => (
            <li key={p.name} style={p.connected === false ? { opacity: 0.5 } : undefined}>
              <span>
                {p.name}
                {p.connected === false && <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.8em' }}>reconnecting...</span>}
              </span>
              {p.is_host && <span className="host-badge">Host</span>}
            </li>
          ))}
        </ul>

        <p className="muted text-center" style={{ fontSize: '0.85em' }}>
          {connectedCount} player{connectedCount !== 1 ? 's' : ''} connected
        </p>

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
