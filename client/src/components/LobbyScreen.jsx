function LobbyScreen({ 
  gameState, 
  setGameState, 
  error, 
  setError,
  handleStartGame
}) {

  return (

    <div style={{ padding: 40 }}>
        <h1>Room: {gameState.clientState.roomCode}</h1>
        <h2>Current Player: {gameState.clientState.playerName}</h2>
        <h2>Player List:</h2>
        <ul>
          {gameState.serverState.players.map((p) => (
            <li key={p.name}>{p.name}{p.is_host ? ' (Host)' : ''}</li>
          ))}
        </ul>

        <button 
          onClick={handleStartGame} 
          disabled={!gameState.clientState.playerIsHost}
          style={{
            marginLeft: 10,
            backgroundColor: gameState.clientState.playerIsHost ? '#007bff' : '#6c757d',
            color: 'white',
            cursor: gameState.clientState.playerIsHost ? 'pointer' : 'not-allowed',
            opacity: gameState.clientState.playerIsHost ? 1 : 0.6
          }}
        >
          {gameState.clientState.playerIsHost ? 'Start Game' : 'Start Game (Host Only)'}
        </button>
        
      </div>
  );
}

export default LobbyScreen;