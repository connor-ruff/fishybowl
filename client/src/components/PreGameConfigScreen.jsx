import { useState, useEffect, useRef } from 'react';
import { PresenceLabel } from './PlayerRoster';
import { saveDraft, loadDraft } from '../utils/session';

const DEFAULT_CONFIG = {
  teams: [{ name: 'Team 1', players: [] }, { name: 'Team 2', players: [] }],
  wordsPerPlayer: 3
};

function PreGameConfigsScreen({
  gameState, error, setError,
  handleSubmitGameConfig, handleRemovePlayer
}) {
  const { roomCode, playerName, playerIsHost } = gameState.clientState;
  const players = gameState.serverState?.players || [];

  // Setup can take a while and phones drop constantly, so the host's work in
  // progress is persisted — a reload or a reconnect never loses team assignments.
  const [config, setConfig] = useState(
    () => loadDraft('config', roomCode, '') || DEFAULT_CONFIG
  );

  useEffect(() => {
    saveDraft('config', roomCode, '', config);
  }, [config, roomCode]);

  // Keep assignments in sync with who's actually in the room
  const playerKey = players.map(p => p.name).join('|');
  const lastKey = useRef(playerKey);
  useEffect(() => {
    if (lastKey.current === playerKey) return;
    lastKey.current = playerKey;
    const liveNames = players.map(p => p.name);
    setConfig(prev => ({
      ...prev,
      teams: prev.teams.map(t => ({
        ...t,
        players: t.players.filter(n => liveNames.includes(n))
      }))
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerKey]);

  const setTeamCount = (numTeams) => {
    setConfig(prev => {
      const teams = Array.from({ length: numTeams }, (_, i) =>
        prev.teams[i] || { name: `Team ${i + 1}`, players: [] }
      );
      // Reassign anyone who was on a team that just disappeared
      const orphans = prev.teams.slice(numTeams).flatMap(t => t.players);
      orphans.forEach((name, i) => teams[i % numTeams].players.push(name));
      return { ...prev, teams };
    });
  };

  const assignPlayer = (name, teamIndex) => {
    setConfig(prev => {
      const teams = prev.teams.map(t => ({
        ...t,
        players: t.players.filter(p => p !== name)
      }));
      if (teamIndex >= 0) teams[teamIndex].players.push(name);
      return { ...prev, teams };
    });
  };

  const setTeamName = (teamIndex, newName) => {
    setConfig(prev => ({
      ...prev,
      teams: prev.teams.map((t, i) => (i === teamIndex ? { ...t, name: newName } : t))
    }));
  };

  // Spread players across teams in a round-robin, so the host doesn't have to
  // tap through every single person
  const autoAssign = () => {
    setConfig(prev => {
      const teams = prev.teams.map(t => ({ ...t, players: [] }));
      players.forEach((p, i) => teams[i % teams.length].players.push(p.name));
      return { ...prev, teams };
    });
  };

  const assigned = config.teams.flatMap(t => t.players);
  const unassigned = players.filter(p => !assigned.includes(p.name));
  const emptyTeams = config.teams.filter(t => t.players.length === 0);

  const submit = () => {
    if (emptyTeams.length > 0) {
      return setError(`${emptyTeams.map(t => t.name).join(', ')} ${emptyTeams.length > 1 ? 'have' : 'has'} no players`);
    }
    if (unassigned.length > 0) {
      const names = unassigned.map(p => p.name).join(', ');
      if (!window.confirm(`${names} ${unassigned.length > 1 ? 'are' : 'is'} not on a team and will sit this game out. Continue?`)) {
        return;
      }
    }
    setError('');
    handleSubmitGameConfig(config);
  };

  if (!playerIsHost) {
    return (
      <div className="page">
        <div className="card card-center">
          <div className="player-header">
            <span>Room: <strong>{roomCode}</strong></span>
            <span>{playerName}</span>
          </div>
          <h1 className="title title-sm">Game Setup</h1>
          <p className="muted">Waiting for the host to pick teams&hellip;</p>
          <p className="muted" style={{ fontSize: '0.85em' }}>
            You can lock your phone — your spot is held.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card card-wide">
        <div className="player-header">
          <span>Room: <strong>{roomCode}</strong></span>
          <span>{playerName}</span>
        </div>
        <h1 className="title title-sm">Configure Game</h1>

        <div className="config-section">
          <label>Number of Teams</label>
          <select
            className="themed-select"
            value={config.teams.length}
            onChange={(e) => setTeamCount(parseInt(e.target.value))}
          >
            {[2, 3, 4].map(n => <option key={n} value={n}>{n} Teams</option>)}
          </select>
        </div>

        <div className="config-section">
          <label>Team Names</label>
          {config.teams.map((team, index) => (
            <div key={index} className="config-row">
              <span>Team {index + 1}:</span>
              <input
                className="themed-input"
                type="text"
                maxLength={20}
                value={team.name}
                onChange={(e) => setTeamName(index, e.target.value)}
                placeholder={`Team ${index + 1}`}
              />
            </div>
          ))}
        </div>

        <div className="config-section">
          <div className="config-label-row">
            <label>Assign Players ({players.length})</label>
            <button className="btn-mini" onClick={autoAssign}>Auto-assign</button>
          </div>
          {players.map((player) => {
            const teamIndex = config.teams.findIndex(t => t.players.includes(player.name));
            return (
              <div key={player.name} className="config-row">
                <span className="config-player-name">
                  {player.name}{player.is_host ? ' (Host)' : ''}
                  <PresenceLabel player={player} />
                </span>
                <select
                  className="themed-select"
                  value={teamIndex >= 0 ? teamIndex : ""}
                  onChange={(e) => assignPlayer(player.name, e.target.value === "" ? -1 : parseInt(e.target.value))}
                >
                  <option value="">Not playing</option>
                  {config.teams.map((team, i) => (
                    <option key={i} value={i}>{team.name}</option>
                  ))}
                </select>
                {!player.is_host && (
                  <button
                    className="btn-mini btn-mini-danger"
                    title={`Remove ${player.name} from the room`}
                    onClick={() => {
                      if (window.confirm(`Remove ${player.name} from the room?`)) {
                        handleRemovePlayer(player.name);
                      }
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {unassigned.length > 0 && (
            <p className="muted" style={{ fontSize: '0.8em' }}>
              Set anyone whose phone died to <em>Not playing</em> and the game will
              start without them.
            </p>
          )}
        </div>

        <div className="config-section">
          <label>Words per Player</label>
          <div className="config-row">
            <input
              className="themed-input"
              type="number"
              min="1"
              max="10"
              value={config.wordsPerPlayer}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                wordsPerPlayer: Math.min(10, Math.max(1, parseInt(e.target.value) || 1))
              }))}
              style={{ width: 80 }}
            />
            <span className="muted">
              Total: {config.wordsPerPlayer * assigned.length} words
            </span>
          </div>
        </div>

        <div className="config-section">
          <label>Team Preview</label>
          {config.teams.map((team, index) => (
            <div key={index} className="team-preview">
              <strong>{team.name}:</strong>{' '}
              {team.players.join(', ') || <span className="muted">No players assigned</span>}
            </div>
          ))}
        </div>

        <button className="btn-success" onClick={submit}>Collect Words</button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

export default PreGameConfigsScreen;
