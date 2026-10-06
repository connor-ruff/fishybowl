import { PresenceLabel } from './PlayerRoster';

// Shown once you've submitted your own words. The point of this screen is to
// make a stalled setup obvious and fixable: you can see exactly who hasn't
// submitted and whether they're even still connected, and the host has two
// ways out that don't involve restarting the game.
function WaitingForWordsScreen({
  gameState, error,
  handleForceStartGame, handleRemovePlayer
}) {
  const { roomCode, playerName, playerIsHost } = gameState.clientState;
  const serverState = gameState.serverState || {};
  const lookup = serverState.playerLookup || {};
  const players = serverState.players || [];

  const outstanding = Object.keys(lookup)
    .filter(name => !lookup[name].wordsSubmitted)
    .map(name => players.find(p => p.name === name) || { name, connected: true, absent: false });

  const total = Object.keys(lookup).length;
  const submitted = total - outstanding.length;
  const anyoneOffline = outstanding.some(p => !p.connected);

  return (
    <div className="page">
      <div className="card card-center">
        <div className="player-header">
          <span>Room: <strong>{roomCode}</strong></span>
          <span>{playerName}</span>
        </div>

        <h1 className="title title-sm">Words Submitted!</h1>
        <p className="muted">{submitted} of {total} players are done.</p>

        {outstanding.length > 0 && (
          <>
            <p className="muted" style={{ fontSize: '0.9em' }}>Still waiting on:</p>
            <ul className="player-list">
              {outstanding.map(p => (
                <li key={p.name} className={p.connected ? undefined : "player-offline"}>
                  <span className="player-name">
                    {p.name}
                    <PresenceLabel player={p} />
                  </span>
                  {playerIsHost && p.name !== playerName && (
                    <button
                      className="btn-mini btn-mini-danger"
                      onClick={() => {
                        if (window.confirm(`Remove ${p.name} from the game?`)) {
                          handleRemovePlayer(p.name);
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {playerIsHost ? (
              <>
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (window.confirm("Start the game with the words submitted so far?")) {
                      handleForceStartGame();
                    }
                  }}
                  style={{ marginTop: '0.5rem' }}
                >
                  Start Anyway
                </button>
                <p className="muted" style={{ fontSize: '0.78em' }}>
                  {anyoneOffline
                    ? "Someone's phone dropped off — start without their words, or remove them."
                    : "Starts with the words collected so far. Everyone still plays."}
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: '0.8em' }}>
                The host can start without them if someone's phone has died.
              </p>
            )}
          </>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

export default WaitingForWordsScreen;
