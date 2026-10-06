import PlayerRoster from './PlayerRoster';

function LobbyScreen({
  gameState,
  error,
  handleStartGame,
  handleRemovePlayer,
  handleTransferHost,
  handleLeaveRoom
}) {
  const players = gameState.serverState?.players || [];
  const { roomCode, playerName, playerIsHost } = gameState.clientState;
  const connectedCount = players.filter(p => p.connected).length;

  return (
    <div className="page">
      <div className="card card-center">
        <div className="player-header">
          <span>Room: <strong>{roomCode}</strong></span>
          <span>{playerName}</span>
        </div>

        <h1 className="title title-sm">Lobby</h1>
        <p className="muted" style={{ fontSize: '0.9em', marginTop: '-0.5rem' }}>
          Share code <strong style={{ letterSpacing: '0.1em' }}>{roomCode}</strong> to let people in
        </p>

        <PlayerRoster
          players={players}
          myName={playerName}
          isHost={playerIsHost}
          onRemove={handleRemovePlayer}
          onTransferHost={handleTransferHost}
        />

        <p className="muted text-center" style={{ fontSize: '0.85em' }}>
          {connectedCount} of {players.length} connected
        </p>

        {playerIsHost ? (
          <>
            <button
              className="btn-primary"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              Start Game
            </button>
            <p className="muted text-center" style={{ fontSize: '0.8em' }}>
              {players.length < 2
                ? 'Need at least 2 players'
                : "You can start even if someone's reconnecting — nobody gets locked out."}
            </p>
          </>
        ) : (
          <p className="muted text-center">Waiting for the host to start&hellip;</p>
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="btn-link" onClick={handleLeaveRoom}>Leave room</button>
      </div>
    </div>
  );
}

export default LobbyScreen;
