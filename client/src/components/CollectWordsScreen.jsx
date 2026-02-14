import { useState, useEffect } from 'react';

function CollectWordsScreen({
     gameState, setGameState, error, setError,
     handleSubmitWords
}) {
    const wordsPerPlayer = gameState?.serverState?.gameConfig?.wordsPerPlayer || 0;
    const [words, setWords] = useState(() => Array(wordsPerPlayer).fill(''));

    useEffect(() => {
        setWords(Array(wordsPerPlayer).fill(''));
    }, [wordsPerPlayer]);

    const handleWordChange = (index, value) => {
        const newWords = [...words];
        newWords[index] = value;
        setWords(newWords);
    };

    const handleSubmitWords_component = () => {
        const submittedWords = words.map(word => word.trim()).filter(word => word.length > 0);

        if (submittedWords.length < wordsPerPlayer) {
            setError(`Please enter all ${wordsPerPlayer} words/phrases.`);
            return;
        }

        console.log('Submitting words:', submittedWords);
        handleSubmitWords(submittedWords);
        setError('');
    };

    const allWordsFilled = words.every(word => word.trim().length > 0);

    return (
        <div className="page">
            <div className="card">
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
                        />
                    </div>
                ))}

                {error && <p className="error-text">{error}</p>}

                <button
                    className="btn-success"
                    onClick={handleSubmitWords_component}
                    disabled={!allWordsFilled}
                >
                    Submit Words
                </button>
            </div>
        </div>
    );
};

export default CollectWordsScreen;
