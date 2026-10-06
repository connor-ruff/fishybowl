// Presence is shown per player and never blocks anybody else. "Reconnecting"
// means we're still holding their spot; "offline" means the grace window
// expired and the game will move on without them.
export function PresenceLabel({ player }) {
  if (player.connected) return null;
  return (
    <span className={player.absent ? "tag tag-offline" : "tag tag-waiting"}>
      {player.absent ? "offline" : "reconnecting"}
    </span>
  );
}

function PlayerRoster({
  players,
  myName,
  isHost,
  onRemove,
  onTransferHost,
  emptyText = "Nobody here yet"
}) {
  if (!players || players.length === 0) {
    return <p className="muted text-center">{emptyText}</p>;
  }

  return (
    <ul className="player-list">
      {players.map(p => (
        <li key={p.name} className={p.connected ? undefined : "player-offline"}>
          <span className="player-name">
            {p.name}
            {p.name === myName && <span className="tag tag-you">you</span>}
            <PresenceLabel player={p} />
          </span>
          <span className="player-actions">
            {p.is_host && <span className="host-badge">Host</span>}
            {isHost && p.name !== myName && onTransferHost && !p.is_host && (
              <button
                className="btn-mini"
                title={`Make ${p.name} the host`}
                onClick={() => onTransferHost(p.name)}
              >
                Make host
              </button>
            )}
            {isHost && p.name !== myName && onRemove && (
              <button
                className="btn-mini btn-mini-danger"
                title={`Remove ${p.name}`}
                onClick={() => {
                  if (window.confirm(`Remove ${p.name} from the game?`)) onRemove(p.name);
                }}
              >
                Remove
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default PlayerRoster;
