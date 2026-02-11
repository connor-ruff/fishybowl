import { useState, useEffect } from 'react';

function GamePlayScreen({
    gameState, setGameState, error, setError, socket,
    handleStartRound, handleStartTurn, handleWordGuessed,
    handleSkipWord, handleNextTurn, handleNextRound, handlePlayAgain
}) {
    const serverState = gameState.serverState;
    const gamePhase = serverState.gamePhase;
    const activeGame = serverState.activeGame;
    const playerName = gameState.clientState.playerName;
    const isHost = gameState.clientState.playerIsHost;

    const currentRound = activeGame.rounds[activeGame.currentRound - 1];
    const currentTeamName = activeGame.teamOrder[activeGame.currentTeamIndex];
    const isClueGiver = activeGame.currentClueGiver === playerName;

    // Which team is the current player on?
    const playerTeam = serverState.playerLookup[playerName]?.team;
    const isOnActiveTeam = playerTeam === currentTeamName;

    // Local timer state — updated by server events for smooth display
    const [timeLeft, setTimeLeft] = useState(activeGame.turnTimeLeft);

    useEffect(() => {
        const onTimer = (time) => setTimeLeft(time);
        socket.on("timer-update", onTimer);
        return () => socket.off("timer-update", onTimer);
    }, [socket]);

    // Sync with server state when phase changes
    useEffect(() => {
        setTimeLeft(activeGame.turnTimeLeft);
    }, [gamePhase, activeGame.turnTimeLeft]);

    // Compute total scores per team
    const totalScores = {};
    activeGame.teamOrder.forEach(team => {
        totalScores[team] = activeGame.scores[team].reduce((a, b) => a + b, 0);
    });

    // ─── Player info header (shown on every screen) ───
    const PlayerHeader = () => (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 16px', marginBottom: 20,
            background: '#2c2c2c', borderRadius: 8, color: '#f0f0f0',
            fontSize: 14, border: '1px solid #444'
        }}>
            <span>Room: <strong>{gameState.clientState.roomCode}</strong></span>
            <span>{playerName}</span>
            <span>{playerTeam}</span>
        </div>
    );

    // ─── Paused screen ───
    if (gamePhase === "paused") {
        const disconnectedPlayers = serverState.players.filter(p => p.connected === false);
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <h1>Game Paused</h1>
                <p style={{ fontSize: 18, marginTop: 20 }}>
                    Waiting for {disconnectedPlayers.map(p => p.name).join(', ')} to reconnect...
                </p>
                <p style={{ color: '#888', marginTop: 10 }}>
                    They can rejoin by entering their name and room code <strong>{gameState.clientState.roomCode}</strong>
                </p>
            </div>
        );
    }

    // ─── Scoreboard widget (reused across views) ───
    const Scoreboard = ({ showRoundBreakdown }) => (
        <div style={{ marginTop: 20, padding: 15, background: '#2c2c2c', borderRadius: 8, color: '#f0f0f0', border: '1px solid #444' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Scoreboard</h3>
            {activeGame.teamOrder.map(team => (
                <div key={team} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid #555'
                }}>
                    <span style={{ fontWeight: team === currentTeamName ? 'bold' : 'normal', color: '#f0f0f0' }}>
                        {team}
                    </span>
                    <span style={{ color: '#f0f0f0' }}>
                        {showRoundBreakdown
                            ? `${totalScores[team]} (${activeGame.scores[team].slice(0, activeGame.currentRound).join(' + ')})`
                            : totalScores[team]
                        }
                    </span>
                </div>
            ))}
        </div>
    );

    // ─── ROUND START ───
    if (gamePhase === "round-start") {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <h1>Round {activeGame.currentRound} of 3</h1>
                <h2>{currentRound.name}</h2>
                <p style={{ fontSize: 18, color: '#555', maxWidth: 400, margin: '20px auto' }}>
                    {currentRound.description}
                </p>
                <p style={{ marginTop: 20, color: '#777' }}>
                    {activeGame.currentClueGiver} from {currentTeamName} goes first!
                </p>
                {activeGame.currentRound > 1 && <Scoreboard showRoundBreakdown />}
                {isHost && (
                    <button
                        onClick={handleStartRound}
                        style={{
                            marginTop: 30, padding: '15px 40px', fontSize: 18,
                            backgroundColor: '#007bff', color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer'
                        }}
                    >
                        Start Round
                    </button>
                )}
                {!isHost && (
                    <p style={{ marginTop: 30, color: '#999' }}>Waiting for host to start the round...</p>
                )}
            </div>
        );
    }

    // ─── TURN READY ───
    if (gamePhase === "turn-ready") {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <p style={{ color: '#777' }}>Round {activeGame.currentRound}: {currentRound.name}</p>
                <h1>{currentTeamName}'s Turn</h1>
                <h2>{activeGame.currentClueGiver} is giving clues</h2>
                <p style={{ color: '#888' }}>
                    {activeGame.wordsRemaining.length} words remaining
                </p>
                <Scoreboard showRoundBreakdown={false} />
                {isClueGiver ? (
                    <button
                        onClick={handleStartTurn}
                        style={{
                            marginTop: 30, padding: '15px 40px', fontSize: 18,
                            backgroundColor: '#28a745', color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer'
                        }}
                    >
                        I'm Ready — Start!
                    </button>
                ) : (
                    <p style={{ marginTop: 30, color: '#999' }}>
                        Waiting for {activeGame.currentClueGiver} to start...
                    </p>
                )}
            </div>
        );
    }

    // ─── TURN ACTIVE ───
    if (gamePhase === "turn-active") {
        const timerColor = timeLeft <= 10 ? '#dc3545' : timeLeft <= 20 ? '#ffc107' : '#333';

        // Clue giver view
        if (isClueGiver) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <PlayerHeader />
                    <div style={{ fontSize: 48, fontWeight: 'bold', color: timerColor }}>
                        {timeLeft}
                    </div>
                    <p style={{ color: '#777', marginBottom: 10 }}>
                        Round {activeGame.currentRound}: {currentRound.name}
                    </p>
                    <div style={{
                        margin: '20px auto', padding: '30px 40px',
                        border: '3px solid #007bff', borderRadius: 12,
                        fontSize: 28, fontWeight: 'bold', maxWidth: 400,
                        background: '#003366', color: '#ffffff'
                    }}>
                        {activeGame.currentWord}
                    </div>
                    <div style={{ marginTop: 30, display: 'flex', justifyContent: 'center', gap: 20 }}>
                        <button
                            onClick={handleWordGuessed}
                            style={{
                                padding: '15px 40px', fontSize: 18,
                                backgroundColor: '#28a745', color: 'white',
                                border: 'none', borderRadius: 8, cursor: 'pointer'
                            }}
                        >
                            Got It!
                        </button>
                        <button
                            onClick={handleSkipWord}
                            style={{
                                padding: '15px 40px', fontSize: 18,
                                backgroundColor: '#6c757d', color: 'white',
                                border: 'none', borderRadius: 8, cursor: 'pointer'
                            }}
                        >
                            Skip
                        </button>
                    </div>
                    <div style={{ marginTop: 20, color: '#888' }}>
                        Guessed this turn: {activeGame.wordsGuessedThisTurn.length} |
                        Remaining: {activeGame.wordsRemaining.length}
                    </div>
                </div>
            );
        }

        // Teammate view
        if (isOnActiveTeam) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <PlayerHeader />
                    <div style={{ fontSize: 48, fontWeight: 'bold', color: timerColor }}>
                        {timeLeft}
                    </div>
                    <p style={{ color: '#777' }}>
                        Round {activeGame.currentRound}: {currentRound.name}
                    </p>
                    <h2>{activeGame.currentClueGiver} is giving clues!</h2>
                    <p style={{ fontSize: 20, marginTop: 20 }}>Guess the word!</p>
                    <div style={{ marginTop: 20, color: '#888' }}>
                        Guessed this turn: {activeGame.wordsGuessedThisTurn.length} |
                        Remaining: {activeGame.wordsRemaining.length}
                    </div>
                    <Scoreboard showRoundBreakdown={false} />
                </div>
            );
        }

        // Other team view
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <div style={{ fontSize: 48, fontWeight: 'bold', color: timerColor }}>
                    {timeLeft}
                </div>
                <p style={{ color: '#777' }}>
                    Round {activeGame.currentRound}: {currentRound.name}
                </p>
                <h2>{currentTeamName} is playing...</h2>
                <p style={{ color: '#888' }}>
                    {activeGame.currentClueGiver} is giving clues
                </p>
                <div style={{ marginTop: 20, color: '#888' }}>
                    Guessed this turn: {activeGame.wordsGuessedThisTurn.length} |
                    Remaining: {activeGame.wordsRemaining.length}
                </div>
                <Scoreboard showRoundBreakdown={false} />
            </div>
        );
    }

    // ─── TURN END ───
    if (gamePhase === "turn-end") {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <h1>Time's Up!</h1>
                <h2>{activeGame.currentClueGiver} got {activeGame.wordsGuessedThisTurn.length} word{activeGame.wordsGuessedThisTurn.length !== 1 ? 's' : ''}</h2>
                {activeGame.wordsGuessedThisTurn.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, marginTop: 15 }}>
                        {activeGame.wordsGuessedThisTurn.map((word, i) => (
                            <li key={i} style={{
                                padding: '8px 16px', margin: '5px auto',
                                background: '#d4edda', borderRadius: 6,
                                maxWidth: 300
                            }}>
                                {word}
                            </li>
                        ))}
                    </ul>
                )}
                <p style={{ marginTop: 15, color: '#888' }}>
                    {activeGame.wordsRemaining.length} words remaining this round
                </p>
                <Scoreboard showRoundBreakdown={false} />
                {isHost && (
                    <button
                        onClick={handleNextTurn}
                        style={{
                            marginTop: 30, padding: '15px 40px', fontSize: 18,
                            backgroundColor: '#007bff', color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer'
                        }}
                    >
                        Next Turn
                    </button>
                )}
                {!isHost && (
                    <p style={{ marginTop: 30, color: '#999' }}>Waiting for host to continue...</p>
                )}
            </div>
        );
    }

    // ─── ROUND END ───
    if (gamePhase === "round-end") {
        const isLastRound = activeGame.currentRound >= 3;
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <h1>Round {activeGame.currentRound} Complete!</h1>
                <h2>{currentRound.name}</h2>

                {/* Round scores */}
                <div style={{ marginTop: 20 }}>
                    <h3>Round {activeGame.currentRound} Results</h3>
                    {activeGame.teamOrder.map(team => (
                        <div key={team} style={{
                            padding: '8px 20px', margin: '5px auto',
                            maxWidth: 300, display: 'flex', justifyContent: 'space-between',
                            background: '#f5f5f5', borderRadius: 6
                        }}>
                            <span>{team}</span>
                            <span style={{ fontWeight: 'bold' }}>
                                {activeGame.scores[team][activeGame.currentRound - 1]} pts
                            </span>
                        </div>
                    ))}
                </div>

                <Scoreboard showRoundBreakdown />

                {isHost && (
                    <button
                        onClick={handleNextRound}
                        style={{
                            marginTop: 30, padding: '15px 40px', fontSize: 18,
                            backgroundColor: isLastRound ? '#ffc107' : '#007bff',
                            color: isLastRound ? '#333' : 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer'
                        }}
                    >
                        {isLastRound ? 'See Final Results' : `Start Round ${activeGame.currentRound + 1}`}
                    </button>
                )}
                {!isHost && (
                    <p style={{ marginTop: 30, color: '#999' }}>Waiting for host to continue...</p>
                )}
            </div>
        );
    }

    // ─── GAME OVER ───
    if (gamePhase === "game-over") {
        // Determine winner
        const sortedTeams = [...activeGame.teamOrder].sort(
            (a, b) => totalScores[b] - totalScores[a]
        );
        const winner = sortedTeams[0];
        const isTie = totalScores[sortedTeams[0]] === totalScores[sortedTeams[1]];

        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <PlayerHeader />
                <h1>Game Over!</h1>
                {isTie ? (
                    <h2>It's a tie!</h2>
                ) : (
                    <h2>{winner} Wins!</h2>
                )}

                <div style={{ marginTop: 20 }}>
                    <h3>Final Scores</h3>
                    {sortedTeams.map((team, i) => (
                        <div key={team} style={{
                            padding: '12px 20px', margin: '8px auto',
                            maxWidth: 400, display: 'flex', justifyContent: 'space-between',
                            background: i === 0 && !isTie ? '#fff3cd' : '#f5f5f5',
                            borderRadius: 8, border: i === 0 && !isTie ? '2px solid #ffc107' : '1px solid #ddd'
                        }}>
                            <span style={{ fontWeight: 'bold' }}>{team}</span>
                            <span>
                                {totalScores[team]} total ({activeGame.scores[team].join(' + ')})
                            </span>
                        </div>
                    ))}
                </div>

                {isHost && (
                    <button
                        onClick={handlePlayAgain}
                        style={{
                            marginTop: 30, padding: '15px 40px', fontSize: 18,
                            backgroundColor: '#28a745', color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer'
                        }}
                    >
                        Play Again
                    </button>
                )}
                {!isHost && (
                    <p style={{ marginTop: 30, color: '#999' }}>Waiting for host...</p>
                )}
            </div>
        );
    }

    // Fallback
    return (
        <div style={{ padding: 40 }}>
            <h1>Unknown game phase: {gamePhase}</h1>
            <pre>{JSON.stringify(gameState, null, 2)}</pre>
        </div>
    );
}

export default GamePlayScreen;
