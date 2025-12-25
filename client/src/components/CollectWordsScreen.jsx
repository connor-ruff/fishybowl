import { useState, useEffect } from 'react';

function CollectWordsScreen({
     gameState, setGameState, error, setError,
     handleSubmitWords
}) {
    const wordsPerPlayer = gameState?.serverState?.gameConfig?.wordsPerPlayer || 0;
    const [words, setWords] = useState(() => Array(wordsPerPlayer).fill(''));

    // Initialize words array when wordsPerPlayer changes
    useEffect(() => {
        setWords(Array(wordsPerPlayer).fill(''));
    }, [wordsPerPlayer]);

    const handleWordChange = (index, value) => {
        const newWords = [...words];
        newWords[index] = value;
        setWords(newWords);
    };

    const handleSubmitWords_component = () => {
        // Filter out empty words and trim whitespace
        const submittedWords = words.map(word => word.trim()).filter(word => word.length > 0);
        
        if (submittedWords.length < wordsPerPlayer) {
            setError(`Please enter all ${wordsPerPlayer} words/phrases.`);
            return;
        }

        // TODO: Send words to server
        console.log('Submitting words:', submittedWords);
        handleSubmitWords(submittedWords);
        
        // Clear any previous errors
        setError('');
    };

    const allWordsFilled = words.every(word => word.trim().length > 0);

    return (
        <div style={{ padding: 40 }}>
            <h2>Enter Your Words/Phrases</h2>
            <p>Enter {wordsPerPlayer} words or phrases below:</p>
            
            <div style={{ marginTop: 20 }}>
                {words.map((word, index) => (
                    <div key={index} style={{ marginBottom: 15 }}>
                        <label style={{ display: 'block', marginBottom: 5 }}>
                            Word/Phrase {index + 1}:
                        </label>
                        <input
                            type="text"
                            value={word}
                            onChange={(e) => handleWordChange(index, e.target.value)}
                            placeholder={`Enter word or phrase ${index + 1}`}
                            style={{ 
                                width: '100%', 
                                padding: 10, 
                                fontSize: 16,
                                border: '1px solid #ccc',
                                borderRadius: 4
                            }}
                            maxLength={100} // Reasonable limit for words/phrases
                        />
                    </div>
                ))}
            </div>

            {error && (
                <div style={{ 
                    color: 'red', 
                    marginTop: 20, 
                    padding: 10, 
                    border: '1px solid red', 
                    borderRadius: 4,
                    backgroundColor: '#ffebee'
                }}>
                    {error}
                </div>
            )}

            <div style={{ marginTop: 30 }}>
                <button 
                    onClick={handleSubmitWords_component}
                    disabled={!allWordsFilled}
                    style={{ 
                        padding: '10px 20px',
                        fontSize: 16,
                        backgroundColor: allWordsFilled ? '#4CAF50' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: allWordsFilled ? 'pointer' : 'not-allowed'
                    }}
                >
                    Submit Words
                </button>
            </div>
        </div>
    );
};

export default CollectWordsScreen;