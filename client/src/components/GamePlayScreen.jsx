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

    const playerTeam = serverState.playerLookup[playerName]?.team;
    const isOnActiveTeam = playerTeam === currentTeamName;

    const [timeLeft, setTimeLeft] = useState(activeGame.turnTimeLeft);

    useEffect(() => {
        const onTimer = (time) => setTimeLeft(time);
        socket.on("timer-update", onTimer);
        return () => socket.off("timer-update", onTimer);
    }, [socket]);

    useEffect(() => {
        setTimeLeft(activeGame.turnTimeLeft);
    }, [gamePhase, activeGame.turnTimeLeft]);

    const totalScores = {};
    activeGame.teamOrder.forEach(team => {
        const roundTotal = activeGame.scores[team].reduce((a, b) => a + b, 0);
        const hostAdj = activeGame.hostAdjustments?.[team] || 0;
        totalScores[team] = roundTotal + hostAdj;
    });

    const timerClass = timeLeft <= 10 ? 'timer-danger' : timeLeft <= 20 ? 'timer-warn' : 'timer-ok';
    const turnHistory = activeGame.turnHistory || [];

    // ─── Player info header ───
    const PlayerHeader = () => (
        <div className="player-header">
            <span>Room: <strong>{gameState.clientState.roomCode}</strong></span>
            <span>{playerName}</span>
            <span>{playerTeam}</span>
        </div>
    );

    // ─── Scoreboard ───
    const Scoreboard = ({ showRoundBreakdown }) => (
        <div className="panel">
            <h3 className="panel-title">Scoreboard</h3>
            {activeGame.teamOrder.map(team => {
                const hostAdj = activeGame.hostAdjustments?.[team] || 0;
                return (
                    <div key={team} className="panel-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: team === currentTeamName ? 'bold' : 'normal' }}>
                                {team}
                            </span>
                            <span style={{ fontWeight: 'bold' }}>
                                {totalScores[team]}
                            </span>
                        </div>
                        {showRoundBreakdown && (
                            <div style={{ paddingLeft: 10, fontSize: '0.8em', marginTop: 4 }} className="muted">
                                {activeGame.scores[team].slice(0, activeGame.currentRound).map((roundScore, ri) => {
                                    const roundTurns = turnHistory.filter(t => t.team === team && t.round === ri + 1);
                                    return (
                                        <div key={ri} style={{ marginBottom: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                                <span>R{ri + 1}: {activeGame.rounds[ri].name}</span>
                                                <span>{roundScore} pts</span>
                                            </div>
                                            {roundTurns.map((turn, ti) => (
                                                <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 12, fontSize: '0.85em', opacity: 0.7 }}>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#ffc107' }}>
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

    // ─── Score Adjustment (host only) ───
    const ScoreAdjust = () => (
        <div className="panel">
            <h3 className="panel-title">Adjust Scores</h3>
            {activeGame.teamOrder.map(team => (
                <div key={team} className="panel-row">
                    <span>{team}</span>
                    <div className="score-adjust">
                        <button className="btn-icon btn-icon-minus" onClick={() => handleAdjustScore(team, -1)}>-</button>
                        <span className="score-value">{totalScores[team]}</span>
                        <button className="btn-icon btn-icon-plus" onClick={() => handleAdjustScore(team, 1)}>+</button>
                    </div>
                </div>
            ))}
        </div>
    );

    // ─── PAUSED ───
    if (gamePhase === "paused") {
        const disconnectedPlayers = serverState.players.filter(p => p.connected === false);
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <h1 className="title title-sm">Game Paused</h1>
                    <p>
                        Waiting for {disconnectedPlayers.map(p => p.name).join(', ')} to reconnect...
                    </p>
                    <p className="muted">
                        They can rejoin with room code <strong>{gameState.clientState.roomCode}</strong>
                    </p>
                </div>
            </div>
        );
    }

    // ─── ROUND START ───
    if (gamePhase === "round-start") {
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <h1 className="title title-sm">Round {activeGame.currentRound} of 3</h1>
                    <h2 style={{ margin: '0' }}>{currentRound.name}</h2>
                    <p className="muted" style={{ maxWidth: 360, margin: '0 auto' }}>
                        {currentRound.description}
                    </p>
                    <p className="muted">
                        {activeGame.currentClueGiver} from {currentTeamName} goes first!
                    </p>
                    {activeGame.currentRound > 1 && <Scoreboard showRoundBreakdown />}
                    {isHost ? (
                        <button className="btn-primary" onClick={handleStartRound}>Start Round</button>
                    ) : (
                        <p className="muted">Waiting for host to start the round...</p>
                    )}
                </div>
            </div>
        );
    }

    // ─── TURN READY ───
    if (gamePhase === "turn-ready") {
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <p className="muted">Round {activeGame.currentRound}: {currentRound.name}</p>
                    <h1 className="title title-sm">{currentTeamName}'s Turn</h1>
                    <h2 style={{ margin: 0 }}>{activeGame.currentClueGiver} is giving clues</h2>
                    <p className="muted">{activeGame.wordsRemaining.length} words remaining</p>
                    <Scoreboard showRoundBreakdown={false} />
                    {isClueGiver ? (
                        <button className="btn-success" onClick={handleStartTurn}>
                            I'm Ready — Start!
                        </button>
                    ) : (
                        <p className="muted">
                            Waiting for {activeGame.currentClueGiver} to start...
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ─── TURN ACTIVE ───
    if (gamePhase === "turn-active") {

        // Clue giver view
        if (isClueGiver) {
            return (
                <div className="page">
                    <div className="card card-center">
                        <PlayerHeader />
                        <div className={`timer ${timerClass}`}>{timeLeft}</div>
                        <p className="muted">Round {activeGame.currentRound}: {currentRound.name}</p>
                        <div className="word-card">{activeGame.currentWord}</div>
                        <div className="btn-row">
                            <button className="btn-success" onClick={handleWordGuessed}>Got It!</button>
                            <button
                                className="btn-danger"
                                onClick={handleSkipWord}
                                disabled={activeGame.wordsRemaining.length === 0}
                            >
                                Skip
                            </button>
                        </div>
                        <p className="muted" style={{ fontSize: '0.85em' }}>
                            Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemaining.length}
                        </p>
                    </div>
                </div>
            );
        }

        // Teammate view
        if (isOnActiveTeam) {
            return (
                <div className="page">
                    <div className="card card-center">
                        <PlayerHeader />
                        <div className={`timer ${timerClass}`}>{timeLeft}</div>
                        <p className="muted">Round {activeGame.currentRound}: {currentRound.name}</p>
                        <h2 style={{ margin: 0 }}>{activeGame.currentClueGiver} is giving clues!</h2>
                        <p style={{ fontSize: '1.2em', margin: '8px 0' }}>Guess the word!</p>
                        <p className="muted" style={{ fontSize: '0.85em' }}>
                            Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemaining.length}
                        </p>
                        <Scoreboard showRoundBreakdown={false} />
                    </div>
                </div>
            );
        }

        // Other team view
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <div className={`timer ${timerClass}`}>{timeLeft}</div>
                    <p className="muted">Round {activeGame.currentRound}: {currentRound.name}</p>
                    <h2 style={{ margin: 0 }}>{currentTeamName} is playing...</h2>
                    <p className="muted">{activeGame.currentClueGiver} is giving clues</p>
                    <p className="muted" style={{ fontSize: '0.85em' }}>
                        Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemaining.length}
                    </p>
                    <Scoreboard showRoundBreakdown={false} />
                </div>
            </div>
        );
    }

    // ─── TURN END ───
    if (gamePhase === "turn-end") {
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <h1 className="title title-sm">Time's Up!</h1>
                    <h2 style={{ margin: 0 }}>
                        {activeGame.currentClueGiver} got {activeGame.wordsGuessedThisTurn.length} word{activeGame.wordsGuessedThisTurn.length !== 1 ? 's' : ''}
                    </h2>
                    {activeGame.wordsGuessedThisTurn.length > 0 && (
                        <ul className="word-list">
                            {activeGame.wordsGuessedThisTurn.map((word, i) => (
                                <li key={i}>{word}</li>
                            ))}
                        </ul>
                    )}
                    <p className="muted">{activeGame.wordsRemaining.length} words remaining this round</p>
                    <Scoreboard showRoundBreakdown={false} />
                    {isHost && <ScoreAdjust />}
                    {isHost ? (
                        <button className="btn-primary" onClick={handleNextTurn}>Next Turn</button>
                    ) : (
                        <p className="muted">Waiting for host to continue...</p>
                    )}
                </div>
            </div>
        );
    }

    // ─── ROUND END ───
    if (gamePhase === "round-end") {
        const isLastRound = activeGame.currentRound >= 3;
        return (
            <div className="page">
                <div className="card card-center">
                    <PlayerHeader />
                    <h1 className="title title-sm">Round {activeGame.currentRound} Complete!</h1>
                    <h2 style={{ margin: 0 }}>{currentRound.name}</h2>
                    {activeGame.carriedTimeLeft && (
                        <p className="carried-time">
                            {currentTeamName} cleared the bowl with {activeGame.carriedTimeLeft}s left — they'll start the next round!
                        </p>
                    )}

                    {/* Round scores */}
                    <div className="panel">
                        <h3 className="panel-title">Round {activeGame.currentRound} Results</h3>
                        {activeGame.teamOrder.map(team => (
                            <div key={team} className="panel-row">
                                <span>{team}</span>
                                <span style={{ fontWeight: 'bold' }}>
                                    {activeGame.scores[team][activeGame.currentRound - 1]} pts
                                </span>
                            </div>
                        ))}
                    </div>

                    <Scoreboard showRoundBreakdown />
                    {isHost && <ScoreAdjust />}
                    {isHost ? (
                        <button className={isLastRound ? "btn-primary" : "btn-success"} onClick={handleNextRound}>
                            {isLastRound ? 'See Final Results' : `Start Round ${activeGame.currentRound + 1}`}
                        </button>
                    ) : (
                        <p className="muted">Waiting for host to continue...</p>
                    )}
                </div>
            </div>
        );
    }

    // ─── GAME OVER ───
    if (gamePhase === "game-over") {
        const sortedTeams = [...activeGame.teamOrder].sort(
            (a, b) => totalScores[b] - totalScores[a]
        );
        const winner = sortedTeams[0];
        const isTie = totalScores[sortedTeams[0]] === totalScores[sortedTeams[1]];

        return (
            <div className="page">
                <div className="card card-wide card-center">
                    <PlayerHeader />
                    <h1 className="title">Game Over!</h1>
                    {isTie ? (
                        <h2 style={{ margin: 0 }}>It's a tie!</h2>
                    ) : (
                        <h2 style={{ margin: 0 }}>{winner} Wins!</h2>
                    )}

                    {sortedTeams.map((team, i) => {
                        const hostAdj = activeGame.hostAdjustments?.[team] || 0;
                        const isWinner = i === 0 && !isTie;
                        return (
                            <div key={team} className={`panel ${isWinner ? 'winner-card' : ''}`}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{team}</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{totalScores[team]}</span>
                                </div>
                                <div style={{ fontSize: '0.8em' }} className="muted">
                                    {activeGame.scores[team].map((roundScore, ri) => {
                                        const roundTurns = turnHistory.filter(t => t.team === team && t.round === ri + 1);
                                        return (
                                            <div key={ri} style={{ marginBottom: 4 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                                    <span>R{ri + 1}: {activeGame.rounds[ri].name}</span>
                                                    <span>{roundScore} pts</span>
                                                </div>
                                                {roundTurns.map((turn, ti) => (
                                                    <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 12, fontSize: '0.85em', opacity: 0.7 }}>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#ffc107' }}>
                                            <span>Host adjustment</span>
                                            <span>{hostAdj > 0 ? '+' : ''}{hostAdj}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {isHost ? (
                        <button className="btn-success" onClick={handlePlayAgain}>Play Again</button>
                    ) : (
                        <p className="muted">Waiting for host...</p>
                    )}
                </div>
            </div>
        );
    }

    // Fallback
    return (
        <div className="page">
            <div className="card">
                <h1 className="title title-sm">Unknown phase: {gamePhase}</h1>
                <pre style={{ fontSize: '0.7em', overflow: 'auto' }}>{JSON.stringify(gameState, null, 2)}</pre>
            </div>
        </div>
    );
}

export default GamePlayScreen;
