import { memo, useSyncExternalStore } from 'react';
import { subscribeClock, getClockSnapshot } from '../utils/clock';

// ─── Scoreboard (memoized to avoid re-renders on timer ticks) ───
const Scoreboard = memo(function Scoreboard({ teamOrder, scores, hostAdjustments, totalScores, currentTeamName, currentRound, rounds, turnHistory, showRoundBreakdown }) {
    return (
        <div className="panel">
            <h3 className="panel-title">Scoreboard</h3>
            {teamOrder.map(team => {
                const hostAdj = hostAdjustments?.[team] || 0;
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
                                {scores[team].slice(0, currentRound).map((roundScore, ri) => {
                                    const roundTurns = turnHistory.filter(t => t.team === team && t.round === ri + 1);
                                    return (
                                        <div key={ri} style={{ marginBottom: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                                <span>R{ri + 1}: {rounds[ri].name}</span>
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
});

// ─── Score Adjustment (memoized, host only) ───
const ScoreAdjust = memo(function ScoreAdjust({ teamOrder, totalScores, handleAdjustScore }) {
    return (
        <div className="panel">
            <h3 className="panel-title">Adjust Scores</h3>
            {teamOrder.map(team => (
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
});

// ─── Player info header ───
const PlayerHeader = memo(function PlayerHeader({ roomCode, playerName, playerTeam }) {
    return (
        <div className="player-header">
            <span>Room: <strong>{roomCode}</strong></span>
            <span>{playerName}</span>
            {playerTeam && <span>{playerTeam}</span>}
        </div>
    );
});

// ─── Round rules banner (shown during turn-ready and turn-active) ───
const RoundRuleBanner = memo(function RoundRuleBanner({ roundNumber, round }) {
    return (
        <div className="round-rule-banner">
            <strong>Round {roundNumber}: {round.name}</strong> — {round.description}
        </div>
    );
});

function GamePlayScreen({
    gameState, error,
    handleSkipWaiting, handleStartRound, handleStartTurn, handleWordGuessed,
    handleSkipWord, handleNextTurn, handleNextRound, handlePlayAgain,
    handleAdjustScore, handleEndGame, handleRemovePlayer
}) {
    const serverState = gameState.serverState || {};
    const gamePhase = serverState.gamePhase;
    const activeGame = serverState.activeGame;
    const playerName = gameState.clientState.playerName;
    const isHost = gameState.clientState.playerIsHost;

    const playerTeam = serverState.playerLookup?.[playerName]?.team;

    // The server sends an absolute turnEndsAt, so the countdown is computed
    // locally — a dropped socket doesn't freeze the clock, and a reconnect
    // lands on the correct time with no drift to correct.
    const now = useSyncExternalStore(subscribeClock, getClockSnapshot);
    const turnEndsAt = gamePhase === "turn-active" ? activeGame?.turnEndsAt : null;
    const timeLeft = turnEndsAt
        ? Math.max(0, Math.ceil((turnEndsAt - now) / 1000))
        : (activeGame?.turnTimeLeft ?? 0);

    const header = (
        <PlayerHeader
            roomCode={gameState.clientState.roomCode}
            playerName={playerName}
            playerTeam={playerTeam}
        />
    );

    // Shouldn't happen, but never render a blank screen if it does
    if (!activeGame) {
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    <h1 className="title title-sm">Loading game&hellip;</h1>
                    <p className="muted">Syncing with the server.</p>
                </div>
            </div>
        );
    }

    // ─── WAITING ON A CLUE GIVER ───
    // The only thing that can hold up play: the person who has to give clues
    // has been gone for a while. Everything is frozen rather than lost, and the
    // host can move past them in one tap.
    if (serverState.waitingFor) {
        const waitingOn = serverState.waitingFor;
        const theirTeam = serverState.playerLookup?.[waitingOn]?.team;
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    <h1 className="title title-sm">Hang on&hellip;</h1>
                    <p className="muted">
                        <strong>{waitingOn}</strong>
                        {theirTeam ? ` (${theirTeam})` : ''} is up next but has dropped off.
                        The timer is paused.
                    </p>
                    <p className="muted" style={{ fontSize: '0.85em' }}>
                        They&apos;ll pick up right where they left off when they reopen the game
                        in room <strong>{gameState.clientState.roomCode}</strong>.
                    </p>

                    {isHost ? (
                        <>
                            <button
                                className="btn-primary"
                                onClick={handleSkipWaiting}
                                style={{ marginTop: '1rem' }}
                            >
                                {gamePhase === "turn-active"
                                    ? `End ${waitingOn}'s turn`
                                    : `Skip ${waitingOn} for now`}
                            </button>
                            <button
                                className="btn-mini btn-mini-danger"
                                onClick={() => {
                                    if (window.confirm(`Remove ${waitingOn} from the game entirely?`)) {
                                        handleRemovePlayer(waitingOn);
                                    }
                                }}
                            >
                                Remove {waitingOn} from the game
                            </button>
                        </>
                    ) : (
                        <p className="muted">The host can skip them if they don&apos;t come back.</p>
                    )}

                    {error && <p className="error-text">{error}</p>}
                </div>
            </div>
        );
    }

    // ─── activeGame-dependent setup ───
    const currentRound = activeGame.rounds[activeGame.currentRound - 1];
    const currentTeamName = activeGame.teamOrder[activeGame.currentTeamIndex];
    const isClueGiver = activeGame.currentClueGiver === playerName;
    const isOnActiveTeam = playerTeam === currentTeamName;

    const totalScores = {};
    activeGame.teamOrder.forEach(team => {
        const roundTotal = activeGame.scores[team].reduce((a, b) => a + b, 0);
        const hostAdj = activeGame.hostAdjustments?.[team] || 0;
        totalScores[team] = roundTotal + hostAdj;
    });

    const timerClass = timeLeft <= 10 ? 'timer-danger' : timeLeft <= 20 ? 'timer-warn' : 'timer-ok';
    const turnHistory = activeGame.turnHistory || [];

    // Common props for Scoreboard
    const scoreboardProps = {
        teamOrder: activeGame.teamOrder,
        scores: activeGame.scores,
        hostAdjustments: activeGame.hostAdjustments,
        totalScores,
        currentTeamName,
        currentRound: activeGame.currentRound,
        rounds: activeGame.rounds,
        turnHistory
    };

    const ruleBanner = (
        <RoundRuleBanner roundNumber={activeGame.currentRound} round={currentRound} />
    );

    // ─── ROUND START ───
    if (gamePhase === "round-start") {
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    <h1 className="title title-sm">Round {activeGame.currentRound} of 3</h1>
                    <h2 style={{ margin: '0' }}>{currentRound.name}</h2>
                    <p className="muted" style={{ maxWidth: 360, margin: '0 auto' }}>
                        {currentRound.description}
                    </p>
                    <p className="muted">
                        {activeGame.currentClueGiver} from {currentTeamName} goes first!
                    </p>
                    {activeGame.currentRound > 1 && <Scoreboard {...scoreboardProps} showRoundBreakdown />}
                    {isHost ? (
                        <button className="btn-primary" onClick={handleStartRound}>Start Round</button>
                    ) : (
                        <p className="muted">Waiting for host to start the round...</p>
                    )}
                    {error && <p className="error-text">{error}</p>}
                </div>
            </div>
        );
    }

    // ─── TURN READY ───
    if (gamePhase === "turn-ready") {
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    {ruleBanner}
                    <h1 className="title title-sm">{currentTeamName}'s Turn</h1>
                    <h2 style={{ margin: 0 }}>{activeGame.currentClueGiver} is giving clues</h2>
                    <p className="muted">{activeGame.wordsRemainingCount} words remaining</p>
                    <Scoreboard {...scoreboardProps} showRoundBreakdown={false} />
                    {isClueGiver ? (
                        <button className="btn-success" onClick={handleStartTurn}>
                            I'm Ready — Start!
                        </button>
                    ) : (
                        <p className="muted">
                            Waiting for {activeGame.currentClueGiver} to start...
                        </p>
                    )}
                    {error && <p className="error-text">{error}</p>}
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
                        {header}
                        <div className={`timer ${timerClass}`}>{timeLeft}</div>
                        {ruleBanner}
                        <div className="word-card">{activeGame.currentWord}</div>
                        <div className="btn-row">
                            <button className="btn-success" onClick={handleWordGuessed}>Got It!</button>
                            <button
                                className="btn-danger"
                                onClick={handleSkipWord}
                                disabled={activeGame.wordsRemainingCount === 0}
                            >
                                Skip
                            </button>
                        </div>
                        <p className="muted" style={{ fontSize: '0.85em' }}>
                            Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemainingCount}
                        </p>
                        {error && <p className="error-text">{error}</p>}
                    </div>
                </div>
            );
        }

        // Teammate view
        if (isOnActiveTeam) {
            return (
                <div className="page">
                    <div className="card card-center">
                        {header}
                        <div className={`timer ${timerClass}`}>{timeLeft}</div>
                        {ruleBanner}
                        <h2 style={{ margin: 0 }}>{activeGame.currentClueGiver} is giving clues!</h2>
                        <p style={{ fontSize: '1.2em', margin: '8px 0' }}>Guess the word!</p>
                        <p className="muted" style={{ fontSize: '0.85em' }}>
                            Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemainingCount}
                        </p>
                        <Scoreboard {...scoreboardProps} showRoundBreakdown={false} />
                    </div>
                </div>
            );
        }

        // Other team view
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    <div className={`timer ${timerClass}`}>{timeLeft}</div>
                    {ruleBanner}
                    <h2 style={{ margin: 0 }}>{currentTeamName} is playing...</h2>
                    <p className="muted">{activeGame.currentClueGiver} is giving clues</p>
                    <p className="muted" style={{ fontSize: '0.85em' }}>
                        Guessed: {activeGame.wordsGuessedThisTurn.length} | Remaining: {activeGame.wordsRemainingCount}
                    </p>
                    <Scoreboard {...scoreboardProps} showRoundBreakdown={false} />
                </div>
            </div>
        );
    }

    // ─── TURN END ───
    if (gamePhase === "turn-end") {
        return (
            <div className="page">
                <div className="card card-center">
                    {header}
                    <h1 className="title title-sm">Time's Up!</h1>
                    <h2 style={{ margin: 0 }}>
                        {/* currentClueGiver has already rotated on, so credit the turn's starter */}
                        {turnHistory[turnHistory.length - 1]?.clueGiver || activeGame.currentClueGiver}
                        {' '}got {activeGame.wordsGuessedThisTurn.length} word{activeGame.wordsGuessedThisTurn.length !== 1 ? 's' : ''}
                    </h2>
                    {activeGame.wordsGuessedThisTurn.length > 0 && (
                        <ul className="word-list">
                            {activeGame.wordsGuessedThisTurn.map((word, i) => (
                                <li key={i}>{word}</li>
                            ))}
                        </ul>
                    )}
                    <p className="muted">{activeGame.wordsRemainingCount} words remaining this round</p>
                    <Scoreboard {...scoreboardProps} showRoundBreakdown={false} />
                    {isHost && <ScoreAdjust teamOrder={activeGame.teamOrder} totalScores={totalScores} handleAdjustScore={handleAdjustScore} />}
                    {isHost ? (
                        <>
                            <button className="btn-primary" onClick={handleNextTurn}>Next Turn</button>
                            <button
                                className="btn-link"
                                onClick={() => {
                                    if (window.confirm("End the game here and show final scores?")) handleEndGame();
                                }}
                            >
                                End game early
                            </button>
                        </>
                    ) : (
                        <p className="muted">Waiting for host to continue...</p>
                    )}
                    {error && <p className="error-text">{error}</p>}
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
                    {header}
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

                    <Scoreboard {...scoreboardProps} showRoundBreakdown />
                    {isHost && <ScoreAdjust teamOrder={activeGame.teamOrder} totalScores={totalScores} handleAdjustScore={handleAdjustScore} />}
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
                    {header}
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
