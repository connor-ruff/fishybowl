import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import StartScreen from "./components/StartScreen";
import LobbyScreen from "./components/LobbyScreen";
import PreGameConfigsScreen from "./components/PreGameConfigScreen";
import CollectWordsScreen from "./components/CollectWordsScreen";
import GamePlayScreen from "./components/GamePlayScreen";
import { useGameHandlers } from './hooks/useGameHandlers';
import { SESSION_ID } from './utils/session';

const socket = io();

const GAMEPLAY_PHASES = ["round-start", "turn-ready", "turn-active", "turn-end", "round-end", "game-over", "paused"];

// Derives the display phase from server + client state.
// The only client-only override is "collecting-words-waiting-for-others".
function deriveDisplayPhase(serverState, clientState) {
  if (clientState.clientGamePhase === "start-page") return "start-page";
  if (clientState.clientGamePhase === "connection-error") return "connection-error";
  if (!serverState) return clientState.clientGamePhase;

  const serverPhase = serverState.gamePhase;

  // Client-only override: player submitted words but others haven't
  if (serverPhase === "collecting-words" && clientState.clientGamePhase === "collecting-words-waiting-for-others") {
    return "collecting-words-waiting-for-others";
  }

  // For lobby, use client phase since client tracks "lobby" while server uses "in-lobby"
  if (serverPhase === "in-lobby") return "in-lobby";

  return serverPhase;
}

function App() {

  const [gameState, setGameState] = useState({
    serverState: null,
    clientState: {
      playerName: null,
      playerIsHost: null,
      clientGamePhase: "start-page",
      roomCode: null
    }
  });
  const [error, setError] = useState("");

  // Ref for auto-rejoin (avoids stale closure in socket listener)
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Consolidated socket event listeners
  useEffect(() => {
    const handleServerState = (serverState) => {
      setGameState(prev => {
        const serverPhase = serverState.gamePhase;
        let newClientPhase = prev.clientState.clientGamePhase;

        // Sync client phase from server, preserving client-only overrides
        if (serverPhase === "in-lobby") {
          newClientPhase = "lobby";
        } else if (serverPhase === "pre-game-configs") {
          newClientPhase = "pre-game-configs";
        } else if (serverPhase === "collecting-words") {
          // Preserve "collecting-words-waiting-for-others" if already set
          if (newClientPhase !== "collecting-words-waiting-for-others") {
            newClientPhase = "collecting-words";
          }
        } else {
          // For all other phases (gameplay, paused, etc.), sync directly
          newClientPhase = serverPhase;
        }

        // Update host status if current player's host status changed
        const playerName = prev.clientState.playerName;
        let playerIsHost = prev.clientState.playerIsHost;
        if (playerName && serverState.players) {
          const me = serverState.players.find(p => p.name === playerName);
          if (me) {
            playerIsHost = me.is_host;
          }
        }

        return {
          ...prev,
          serverState,
          clientState: { ...prev.clientState, clientGamePhase: newClientPhase, playerIsHost }
        };
      });
    };

    socket.on("update-players", handleServerState);
    socket.on("game-started", handleServerState);
    socket.on("all-words-submitted", handleServerState);
    socket.on("game-state-update", handleServerState);

    return () => {
      socket.off("update-players");
      socket.off("game-started");
      socket.off("all-words-submitted");
      socket.off("game-state-update");
    };
  }, []);

  // Auto-rejoin on socket reconnect
  useEffect(() => {
    let hasConnected = false;
    const handleConnect = () => {
      if (!hasConnected) {
        hasConnected = true;
        return; // Skip initial connection
      }
      const gs = gameStateRef.current;
      const { roomCode, playerName } = gs.clientState;
      if (roomCode && playerName && gs.serverState) {
        console.log("Socket reconnected — attempting auto-rejoin...");
        socket.emit("join-room", { roomCode, playerName, sessionId: SESSION_ID }, (res) => {
          if (res.success) {
            setGameState(prev => ({
              ...prev,
              serverState: res.gameState,
              clientState: {
                ...prev.clientState,
                playerIsHost: res.isHost || prev.clientState.playerIsHost,
                clientGamePhase: res.gameState.gamePhase === "in-lobby" ? "lobby" : res.gameState.gamePhase
              }
            }));
          } else {
            // Rejoin failed — show recovery UI
            setGameState(prev => ({
              ...prev,
              clientState: { ...prev.clientState, clientGamePhase: "connection-error" }
            }));
            setError(res.error || "Failed to rejoin the game");
          }
        });
      }
    };
    socket.on("connect", handleConnect);
    return () => socket.off("connect", handleConnect);
  }, []);

  const {
    handleCreateRoom, handleJoinRoom, handleStartGame,
    handleSubmitGameConfig, handleSubmitWords,
    handleResumeGame, handleStartRound, handleStartTurn, handleWordGuessed,
    handleSkipWord, handleNextTurn, handleNextRound, handlePlayAgain,
    handleAdjustScore, handleRetryRejoin, handleReturnToStart
  } = useGameHandlers(socket, gameState, setGameState, setError);

  const displayPhase = deriveDisplayPhase(gameState.serverState, gameState.clientState);

  /////////////////////////////////////////////////
  // Render based on derived display phase
  /////////////////////////////////////////////////
  switch (displayPhase) {
    case "start-page":
      return (
        <StartScreen
          gameState={gameState}
          setGameState={setGameState}
          error={error}
          setError={setError}
          handleCreateRoom={handleCreateRoom}
          handleJoinRoom={handleJoinRoom}
        />
      );

    case "lobby":
    case "in-lobby":
      return (
        <LobbyScreen
          gameState={gameState}
          setGameState={setGameState}
          error={error}
          setError={setError}
          handleStartGame={handleStartGame}
        />
      );

    case "pre-game-configs":
      return (
        <PreGameConfigsScreen
          gameState={gameState}
          setGameState={setGameState}
          error={error}
          setError={setError}
          handleSubmitGameConfig={handleSubmitGameConfig}
        />
      );

    case "collecting-words":
      return (
        <CollectWordsScreen
          gameState={gameState}
          setGameState={setGameState}
          error={error}
          setError={setError}
          handleSubmitWords={handleSubmitWords}
        />
      );

    case "collecting-words-waiting-for-others":
      return (
        <div className="page">
          <div className="card card-center">
            <h1 className="title title-sm">Words Submitted!</h1>
            <p className="muted">Waiting for other players to finish...</p>
          </div>
        </div>
      );

    case "connection-error":
      return (
        <div className="page">
          <div className="card card-center">
            <h1 className="title title-sm">Connection Lost</h1>
            <p className="muted">{error || "Lost connection to the game."}</p>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
              <button className="btn-primary" onClick={handleRetryRejoin}>
                Retry
              </button>
              <button className="btn-secondary" onClick={handleReturnToStart}>
                Return Home
              </button>
            </div>
          </div>
        </div>
      );

    default:
      if (GAMEPLAY_PHASES.includes(displayPhase)) {
        return (
          <GamePlayScreen
            gameState={gameState}
            setGameState={setGameState}
            error={error}
            setError={setError}
            socket={socket}
            handleResumeGame={handleResumeGame}
            handleStartRound={handleStartRound}
            handleStartTurn={handleStartTurn}
            handleWordGuessed={handleWordGuessed}
            handleSkipWord={handleSkipWord}
            handleNextTurn={handleNextTurn}
            handleNextRound={handleNextRound}
            handlePlayAgain={handlePlayAgain}
            handleAdjustScore={handleAdjustScore}
          />
        );
      }

      console.log("Unknown game state:\n", gameState);
      return (
        <div className="page">
          <div className="card card-center">
            <h1 className="title title-sm">Unknown Game State</h1>
            <p className="muted">Something went wrong.</p>
            <pre style={{ fontSize: '0.7em', overflow: 'auto' }}>{JSON.stringify(gameState, null, 2)}</pre>
            <button className="btn-secondary" onClick={handleReturnToStart} style={{ marginTop: '1rem' }}>
              Return Home
            </button>
          </div>
        </div>
      );
  }
}

export default App;
