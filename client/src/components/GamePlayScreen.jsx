import { useState, useEffect } from 'react';

function GamePlayScreen({
    gameState, setGameState, error, setError, socket,
    handleStartRound, handleStartTurn, handleWordGuessed,
    handleSkipWord, handleNextTurn, handleNextRound, handlePlayAgain,
    handleAdjustScore
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

    // Compute total scores per team (round scores + host adjustments)
    const totalScores = {};
    activeGame.teamOrder.forEach(team => {
        const roundTotal = activeGame.scores[team].reduce((a, b) => a + b, 0);
        const hostAdj = activeGame.hostAdjustments?.[team] || 0;
        totalScores[team] = roundTotal + hostAdj;
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
    const turnHistory = activeGame.turnHistory || [];

    const Scoreboard = ({ showRoundBreakdown }) => (
        <div style={{ marginTop: 20, padding: 15, background: '#2c2c2c', borderRadius: 8, color: '#f0f0f0', border: '1px solid #444' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Scoreboard</h3>
            {activeGame.teamOrder.map(team => {
                const hostAdj = activeGame.hostAdjustments?.[team] || 0;
                return (
                    <div key={team} style={{ padding: '8px 0', borderBottom: '1px solid #555' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: team === currentTeamName ? 'bold' : 'normal', color: '#f0f0f0', fontSize: 16 }}>
                                {team}
                            </span>
                            <span style={{ color: '#f0f0f0', fontWeight: 'bold', fontSize: 16 }}>
                                {totalScores[team]}
                            </span>
                        </div>
                        {showRoundBreakdown && (
                            <div style={{ marginTop: 6, paddingLeft: 10, fontSize: 13, color: '#aaa' }}>
                                {activeGame.scores[team].slice(0, activeGame.currentRound).map((roundScore, ri) => {
                                    const roundTurns = turnHistory.filter(t => t.team === team && t.round === ri + 1);
                                    return (
                                        <div key={ri} style={{ marginBottom: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#ccc' }}>
                                                <span>R{ri + 1}: {activeGame.rounds[ri].name}</span>
                                                <span>{roundScore} pts</span>
                                            </div>
                                            {roundTurns.map((turn, ti) => (
                                                <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0 1px 12px', color: '#888', fontSize: 12 }}>
                                                    <span>Turn {ti + 1}</span>
                                                    <span>
                                                        +{turn.wordsGuessed}w
                                                        {turn.skips > 0 && ` −${turn.skips}skip`}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                                {hostAdj !== 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#f0ad4e' }}>
                                        <span>Host adjustment</span>
                                        <span>{hostAdj > 0 ? '+' : ''}{hostAdj}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
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
                            disabled={activeGame.wordsRemaining.length === 0}
                            style={{
                                padding: '15px 40px', fontSize: 18,
                                backgroundColor: activeGame.wordsRemaining.length === 0 ? '#444' : '#6c757d',
                                color: activeGame.wordsRemaining.length === 0 ? '#777' : 'white',
                                border: 'none', borderRadius: 8,
                                cursor: activeGame.wordsRemaining.length === 0 ? 'not-allowed' : 'pointer'
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
                                background: '#1a3d2a', color: '#c8e6c9', borderRadius: 6,
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

                {/* Host score adjustment */}
                {isHost && (
                    <div style={{ marginTop: 25, padding: 15, background: '#2c2c2c', borderRadius: 8, border: '1px solid #444' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Adjust Scores</h3>
                        {activeGame.teamOrder.map(team => (
                            <div key={team} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 0', borderBottom: '1px solid #555'
                            }}>
                                <span style={{ color: '#f0f0f0', minWidth: 100 }}>{team}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button
                                        onClick={() => handleAdjustScore(team, -1)}
                                        style={{
                                            width: 32, height: 32, fontSize: 18,
                                            backgroundColor: '#dc3545', color: 'white',
                                            border: 'none', borderRadius: 6, cursor: 'pointer'
                                        }}
                                    >
                                        -
                                    </button>
                                    <span style={{ color: '#f0f0f0', fontWeight: 'bold', minWidth: 30, textAlign: 'center' }}>
                                        {totalScores[team]}
                                    </span>
                                    <button
                                        onClick={() => handleAdjustScore(team, 1)}
                                        style={{
                                            width: 32, height: 32, fontSize: 18,
                                            backgroundColor: '#28a745', color: 'white',
                                            border: 'none', borderRadius: 6, cursor: 'pointer'
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

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
                {activeGame.carriedTimeLeft && (
                    <p style={{ color: '#f0ad4e', marginTop: 10 }}>
                        {currentTeamName} cleared the bowl with {activeGame.carriedTimeLeft}s left — they'll start the next round!
                    </p>
                )}

                {/* Round scores */}
                <div style={{ marginTop: 20 }}>
                    <h3>Round {activeGame.currentRound} Results</h3>
                    {activeGame.teamOrder.map(team => (
                        <div key={team} style={{
                            padding: '8px 20px', margin: '5px auto',
                            maxWidth: 300, display: 'flex', justifyContent: 'space-between',
                            background: '#2c2c2c', color: '#f0f0f0', borderRadius: 6
                        }}>
                            <span>{team}</span>
                            <span style={{ fontWeight: 'bold' }}>
                                {activeGame.scores[team][activeGame.currentRound - 1]} pts
                            </span>
                        </div>
                    ))}
                </div>

                <Scoreboard showRoundBreakdown />

                {/* Host score adjustment */}
                {isHost && (
                    <div style={{ marginTop: 25, padding: 15, background: '#2c2c2c', borderRadius: 8, border: '1px solid #444' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Adjust Scores</h3>
                        {activeGame.teamOrder.map(team => (
                            <div key={team} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 0', borderBottom: '1px solid #555'
                            }}>
                                <span style={{ color: '#f0f0f0', minWidth: 100 }}>{team}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button
                                        onClick={() => handleAdjustScore(team, -1)}
                                        style={{
                                            width: 32, height: 32, fontSize: 18,
                                            backgroundColor: '#dc3545', color: 'white',
                                            border: 'none', borderRadius: 6, cursor: 'pointer'
                                        }}
                                    >
                                        -
                                    </button>
                                    <span style={{ color: '#f0f0f0', fontWeight: 'bold', minWidth: 30, textAlign: 'center' }}>
                                        {totalScores[team]}
                                    </span>
                                    <button
                                        onClick={() => handleAdjustScore(team, 1)}
                                        style={{
                                            width: 32, height: 32, fontSize: 18,
                                            backgroundColor: '#28a745', color: 'white',
                                            border: 'none', borderRadius: 6, cursor: 'pointer'
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

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
                    {sortedTeams.map((team, i) => {
                        const hostAdj = activeGame.hostAdjustments?.[team] || 0;
                        return (
                            <div key={team} style={{
                                padding: '12px 20px', margin: '8px auto',
                                maxWidth: 400, textAlign: 'left',
                                background: i === 0 && !isTie ? '#3d3000' : '#2c2c2c',
                                color: '#f0f0f0',
                                borderRadius: 8, border: i === 0 && !isTie ? '2px solid #ffc107' : '1px solid #444'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 'bold', fontSize: 16 }}>{team}</span>
                                    <span style={{ fontWeight: 'bold', fontSize: 16 }}>{totalScores[team]}</span>
                                </div>
                                <div style={{ fontSize: 13, color: '#aaa', paddingLeft: 8 }}>
                                    {activeGame.scores[team].map((roundScore, ri) => {
                                        const roundTurns = turnHistory.filter(t => t.team === team && t.round === ri + 1);
                                        return (
                                            <div key={ri} style={{ marginBottom: 4 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#ccc' }}>
                                                    <span>R{ri + 1}: {activeGame.rounds[ri].name}</span>
                                                    <span>{roundScore} pts</span>
                                                </div>
                                                {roundTurns.map((turn, ti) => (
                                                    <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0 1px 12px', color: '#888', fontSize: 12 }}>
                                                        <span>Turn {ti + 1}</span>
                                                        <span>
                                                            +{turn.wordsGuessed}w
                                                            {turn.skips > 0 && ` −${turn.skips}skip`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    {hostAdj !== 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#f0ad4e' }}>
                                            <span>Host adjustment</span>
                                            <span>{hostAdj > 0 ? '+' : ''}{hostAdj}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
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
