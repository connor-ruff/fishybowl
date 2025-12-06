import { useState } from 'react';

function PreGameConfigsScreen({
     gameState, setGameState, error, setError 
}) {
  
  // Local temporary state for configuration
  const [tempConfig, setTempConfig] = useState({
    numTeams: 2,
    teams: [{ name: 'Team 1', players: [] }, { name: 'Team 2', players: [] }],
    wordsPerPlayer: 3
  });

  const handleTeamCountChange = (numTeams) => {
    const teams = Array(numTeams).fill(null).map((_, i) => ({ 
      name: `Team ${i + 1}`, 
      players: [] 
    }));
    setTempConfig(prev => ({ ...prev, numTeams, teams }));
  };

  const handlePlayerTeamChange = (playerName, teamIndex) => {
    const newTeams = [...tempConfig.teams];
    // Remove player from all teams first
    newTeams.forEach(team => {
      team.players = team.players.filter(p => p !== playerName);
    });
    // Add to new team if teamIndex is valid
    if (teamIndex >= 0) {
      newTeams[teamIndex].players.push(playerName);
    }
    setTempConfig(prev => ({ ...prev, teams: newTeams }));
  };

  const handleWordsPerPlayerChange = (count) => {
    setTempConfig(prev => ({ ...prev, wordsPerPlayer: count }));
  };

  const handleTeamNameChange = (teamIndex, newName) => {
    const newTeams = [...tempConfig.teams];
    newTeams[teamIndex].name = newName;
    setTempConfig(prev => ({ ...prev, teams: newTeams }));
  };

  const handleSubmitConfig = () => {
    console.log("Submitting configuration:\n", tempConfig);
    
    // Check if all players are assigned to teams
    const assignedPlayers = tempConfig.teams.flatMap(team => team.players);
    const totalPlayers = gameState.serverState?.players?.length || 0;
    
    if (assignedPlayers.length !== totalPlayers) {
      return alert("Please assign all players to teams");
    }
    
    // Send temporary config to server
    console.log("Submitting config to server:", tempConfig);
    // TODO: socket.emit("submit-game-config", tempConfig, callback);
    alert("Configuration submitted! (Server integration needed)");
  };

  // Only host can configure
  if (!gameState.clientState.playerIsHost) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Game Configuration</h1>
        <p>Waiting for host to configure the game...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Configure Game</h1>
      
      {/* Number of Teams */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Number of Teams:</h3>
        <select 
          value={tempConfig.numTeams} 
          onChange={(e) => handleTeamCountChange(parseInt(e.target.value))}
          style={{ padding: '8px', fontSize: '16px' }}
        >
          <option value={2}>2 Teams</option>
          <option value={3}>3 Teams</option>
          <option value={4}>4 Teams</option>
        </select>
      </div>

      {/* Team Names */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Team Names:</h3>
        {tempConfig.teams.map((team, index) => (
          <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
            <span style={{ minWidth: '80px' }}>Team {index + 1}:</span>
            <input
              type="text"
              value={team.name}
              onChange={(e) => handleTeamNameChange(index, e.target.value)}
              placeholder={`Team ${index + 1}`}
              style={{ 
                padding: '8px', 
                fontSize: '14px', 
                marginLeft: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '200px'
              }}
            />
          </div>
        ))}
      </div>

      {/* Team Assignment */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Assign Players to Teams:</h3>
        {gameState.serverState?.players?.map((player) => {
          const currentTeamIndex = tempConfig.teams.findIndex(team => 
            team.players.includes(player.name)
          );
          return (
            <div key={player.name} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
              <span style={{ minWidth: '150px' }}>
                {player.name}{player.is_host ? ' (Host)' : ''}
              </span>
              <select 
                value={currentTeamIndex >= 0 ? currentTeamIndex : ""}
                onChange={(e) => handlePlayerTeamChange(player.name, e.target.value === "" ? -1 : parseInt(e.target.value))}
                style={{ padding: '5px', marginLeft: '10px' }}
              >
                <option value="">Unassigned</option>
                {tempConfig.teams.map((team, index) => (
                  <option key={index} value={index}>{team.name}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>


      {/* Words Per Player */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Words per Player:</h3>
        <input 
          type="number" 
          min="1" 
          max="10" 
          value={tempConfig.wordsPerPlayer}
          onChange={(e) => handleWordsPerPlayerChange(parseInt(e.target.value))}
          style={{ padding: '8px', fontSize: '16px', width: '80px' }}
        />
        <span style={{ marginLeft: '10px' }}>
          Total words: {tempConfig.wordsPerPlayer * (gameState.serverState?.players?.length || 0)}
        </span>
      </div>

      {/* Team Preview */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Team Preview:</h3>
        {tempConfig.teams.map((team, index) => (
          <div key={index} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <strong>{team.name}:</strong> {team.players.join(', ') || 'No players assigned'}
          </div>
        ))}
      </div>



      {/* Start Game Button */}
      <div style={{ marginTop: '30px' }}>
        <button 
          onClick={handleSubmitConfig}
          style={{ 
            padding: '15px 30px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Start Game
        </button>
      </div>

      {error && <p style={{ color: "red", marginTop: '20px' }}>{error}</p>}
    </div>
  );
}

export default PreGameConfigsScreen;