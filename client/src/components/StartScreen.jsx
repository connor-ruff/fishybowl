import { useState } from 'react';
import { RELEASE_NOTES } from '../releaseNotes';

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReleaseNote() {
  const [open, setOpen] = useState(false);
  const [latest, ...older] = RELEASE_NOTES;
  if (!latest) return null;

  return (
    <div className="release-note">
      <p className="release-line">
        <span className="release-date">Updated {formatDate(latest.date)}</span>
        <span className="release-sep">·</span>
        <span>{latest.notes}</span>
      </p>
      {older.length > 0 && (
        <>
          <button className="release-toggle" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide history' : 'What changed before'}
          </button>
          {open && (
            <ul className="release-history">
              {older.map(entry => (
                <li key={entry.date}>
                  <span className="release-date">{formatDate(entry.date)}</span> — {entry.notes}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StartScreen({
  gameState,
  setGameState,
  error,
  setError,
  notice,
  setNotice,
  handleCreateRoom,
  handleJoinRoom
}) {
  const { playerName, roomCode } = gameState.clientState;

  const setField = (field) => (e) => {
    const value = field === 'roomCode' ? e.target.value.toUpperCase() : e.target.value;
    setError("");
    if (setNotice) setNotice("");
    setGameState(prev => ({
      ...prev,
      clientState: { ...prev.clientState, [field]: value }
    }));
  };

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">Fishybowl</h1>
        <p className="subtitle">The party word-guessing game</p>

        {notice && <p className="notice-text">{notice}</p>}

        <input
          className="themed-input"
          placeholder="Your name"
          maxLength={20}
          value={playerName || ""}
          onChange={setField('playerName')}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
        />

        <button className="btn-primary" onClick={handleCreateRoom}>Create Room</button>

        <div className="start-divider">
          <span>or join an existing room</span>
        </div>

        <div className="start-join-row">
          <input
            className="themed-input"
            placeholder="Room code"
            maxLength={4}
            value={roomCode || ""}
            onChange={setField('roomCode')}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom(roomCode)}
          />
          <button className="btn-secondary" onClick={() => handleJoinRoom(roomCode)}>
            Join Room
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <ReleaseNote />
      </div>
    </div>
  );
}

export default StartScreen;
