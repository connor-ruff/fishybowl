import { useState, useEffect } from 'react';
import { saveDraft, loadDraft } from '../utils/session';

function CollectWordsScreen({
    gameState, error, setError, handleSubmitWords
}) {
    const { roomCode, playerName } = gameState.clientState;
    const wordsPerPlayer = gameState.serverState?.gameConfig?.wordsPerPlayer || 0;

    // Words are persisted on every keystroke. Previously a disconnect anywhere
    // in the room unmounted this screen and wiped whatever had been typed —
    // now the draft survives reconnects, reloads and closing the tab.
    const [stored, setStored] = useState(() => {
        const draft = loadDraft('words', roomCode, playerName);
        return Array.isArray(draft) ? draft : [];
    });

    // Derived rather than stored, so the host changing the word count mid-setup
    // resizes the form without discarding anything already typed.
    const words = Array.from({ length: wordsPerPlayer }, (_, i) => stored[i] ?? '');

    useEffect(() => {
        saveDraft('words', roomCode, playerName, stored);
    }, [stored, roomCode, playerName]);

    const handleWordChange = (index, value) => {
        setStored(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
        if (error) setError('');
    };

    const filled = words.filter(w => w.trim().length > 0);
    const allWordsFilled = filled.length === wordsPerPlayer && wordsPerPlayer > 0;

    const submit = () => {
        if (!allWordsFilled) {
            setError(`Please enter all ${wordsPerPlayer} words or phrases.`);
            return;
        }
        setError('');
        handleSubmitWords(words.map(w => w.trim()));
    };

    return (
        <div className="page">
            <div className="card">
                <div className="player-header">
                    <span>Room: <strong>{roomCode}</strong></span>
                    <span>{playerName}</span>
                </div>
                <h1 className="title title-sm">Your Words</h1>
                <p className="subtitle">Enter {wordsPerPlayer} words or phrases</p>

                {words.map((word, index) => (
                    <div key={index} className="word-input-group">
                        <label>Word {index + 1}</label>
                        <input
                            className="themed-input"
                            type="text"
                            value={word}
                            onChange={(e) => handleWordChange(index, e.target.value)}
                            placeholder={`Enter word or phrase ${index + 1}`}
                            maxLength={100}
                            autoComplete="off"
                        />
                    </div>
                ))}

                <p className="muted text-center" style={{ fontSize: '0.78em' }}>
                    Saved as you type — safe to switch apps.
                </p>

                {error && <p className="error-text">{error}</p>}

                <button className="btn-success" onClick={submit} disabled={!allWordsFilled}>
                    Submit Words
                </button>
            </div>
        </div>
    );
}

export default CollectWordsScreen;
