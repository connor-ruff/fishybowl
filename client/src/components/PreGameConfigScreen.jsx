import { useState } from 'react';

function PreGameConfigsScreen({
     gameState, setGameState, error, setError,
     handleSubmitGameConfig
}) {

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
    newTeams.forEach(team => {
      team.players = team.players.filter(p => p !== playerName);
    });
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

  const handleSubmitConfig_component = () => {
    console.log("Submitting configuration:\n", tempConfig);

    const assignedPlayers = tempConfig.teams.flatMap(team => team.players);
    const totalPlayers = gameState.serverState?.players?.length || 0;

    if (assignedPlayers.length !== totalPlayers) {
      return alert("Please assign all players to teams");
    }

    handleSubmitGameConfig(tempConfig);
  };

  // Non-host waiting view
  if (!gameState.clientState.playerIsHost) {
    return (
      <div className="page">
        <div className="card card-center">
          <h1 className="title title-sm">Game Setup</h1>
          <p className="muted">Waiting for host to configure the game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card card-wide">
        <h1 className="title title-sm">Configure Game</h1>

        {/* Number of Teams */}
        <div className="config-section">
          <label>Number of Teams</label>
          <select
            className="themed-select"
            value={tempConfig.numTeams}
            onChange={(e) => handleTeamCountChange(parseInt(e.target.value))}
          >
            <option value={2}>2 Teams</option>
            <option value={3}>3 Teams</option>
            <option value={4}>4 Teams</option>
          </select>
        </div>

        {/* Team Names */}
        <div className="config-section">
          <label>Team Names</label>
          {tempConfig.teams.map((team, index) => (
            <div key={index} className="config-row">
              <span>Team {index + 1}:</span>
              <input
                className="themed-input"
                type="text"
                value={team.name}
                onChange={(e) => handleTeamNameChange(index, e.target.value)}
                placeholder={`Team ${index + 1}`}
              />
            </div>
          ))}
        </div>

        {/* Team Assignment */}
        <div className="config-section">
          <label>Assign Players</label>
          {gameState.serverState?.players?.map((player) => {
            const currentTeamIndex = tempConfig.teams.findIndex(team =>
              team.players.includes(player.name)
            );
            return (
              <div key={player.name} className="config-row">
                <span>{player.name}{player.is_host ? ' (Host)' : ''}</span>
                <select
                  className="themed-select"
                  value={currentTeamIndex >= 0 ? currentTeamIndex : ""}
                  onChange={(e) => handlePlayerTeamChange(player.name, e.target.value === "" ? -1 : parseInt(e.target.value))}
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
        <div className="config-section">
          <label>Words per Player</label>
          <div className="config-row">
            <input
              className="themed-input"
              type="number"
              min="1"
              max="10"
              value={tempConfig.wordsPerPlayer}
              onChange={(e) => handleWordsPerPlayerChange(parseInt(e.target.value))}
              style={{ width: 80 }}
            />
            <span className="muted">
              Total: {tempConfig.wordsPerPlayer * (gameState.serverState?.players?.length || 0)} words
            </span>
          </div>
        </div>

        {/* Team Preview */}
        <div className="config-section">
          <label>Team Preview</label>
          {tempConfig.teams.map((team, index) => (
            <div key={index} className="team-preview">
              <strong>{team.name}:</strong> {team.players.join(', ') || <span className="muted">No players assigned</span>}
            </div>
          ))}
        </div>

        <button className="btn-success" onClick={handleSubmitConfig_component}>
          Start Game
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

export default PreGameConfigsScreen;
