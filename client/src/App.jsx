import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import StartScreen from "./components/StartScreen";
import LobbyScreen from "./components/LobbyScreen";
import PreGameConfigsScreen from "./components/PreGameConfigScreen";
import CollectWordsScreen from "./components/CollectWordsScreen";
import GamePlayScreen from "./components/GamePlayScreen";
import { useGameHandlers } from './hooks/useGameHandlers';

const socket = io("http://localhost:3001");

const GAMEPLAY_PHASES = ["round-start", "turn-ready", "turn-active", "turn-end", "round-end", "game-over", "paused"];

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

  // Listen for socket events
  useEffect(() => {
    socket.on("update-players", (serverState) => {
      setGameState(prev => ({ ...prev, serverState: serverState }));
    });

    socket.on("game-started", (serverState) => {
      console.log("Game started! Room data:", serverState);
      setGameState(prev => ({ ...prev, serverState: serverState, clientState: { ...prev.clientState, clientGamePhase: "collecting-words" } }));
    });

    socket.on("all-words-submitted", (serverState) => {
      console.log("All words submitted! Room data:", serverState);
      setGameState(prev => ({
        ...prev,
        serverState: serverState,
        clientState: { ...prev.clientState, clientGamePhase: serverState.gamePhase }
      }));
    });

    // Gameplay state updates (broadcast by server during active game)
    socket.on("game-state-update", (serverState) => {
      setGameState(prev => ({
        ...prev,
        serverState: serverState,
        clientState: { ...prev.clientState, clientGamePhase: serverState.gamePhase }
      }));
    });

    return () => {
      socket.off("update-players");
      socket.off("game-started");
      socket.off("all-words-submitted");
      socket.off("game-state-update");
    };
  }, []);

  // Auto-rejoin on socket reconnect (handles brief network drops)
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
        socket.emit("join-room", { roomCode, playerName }, (res) => {
          if (res.success) {
            setGameState(prev => ({
              ...prev,
              serverState: res.gameState,
              clientState: {
                ...prev.clientState,
                playerIsHost: res.isHost || prev.clientState.playerIsHost,
                clientGamePhase: res.gameState.gamePhase
              }
            }));
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
    handleStartRound, handleStartTurn, handleWordGuessed,
    handleSkipWord, handleNextTurn, handleNextRound, handlePlayAgain,
    handleAdjustScore
  } = useGameHandlers(socket, gameState, setGameState, setError);


  /////////////////////////////////////////////////
  // Render different screens based on game phase
  /////////////////////////////////////////////////
  if (gameState.clientState.clientGamePhase === "start-page") {
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
  }
  else if (gameState.serverState.gamePhase === "in-lobby") {
    return (
      <LobbyScreen
        gameState={gameState}
        setGameState={setGameState}
        error={error}
        setError={setError}
        handleStartGame={handleStartGame}
      />
    );
  }

  else if (gameState.serverState.gamePhase === "pre-game-configs") {
    return (
      <PreGameConfigsScreen
        gameState={gameState}
        setGameState={setGameState}
        error={error}
        setError={setError}
        handleSubmitGameConfig={handleSubmitGameConfig}
      />
    );
  }

  else if (gameState.serverState.gamePhase === "collecting-words" && gameState.clientState.clientGamePhase !== "collecting-words-waiting-for-others") {
    return (
      <CollectWordsScreen
        gameState={gameState}
        setGameState={setGameState}
        error={error}
        setError={setError}
        handleSubmitWords={handleSubmitWords}
      />
    );
  }

  else if (gameState.clientState.clientGamePhase === "collecting-words-waiting-for-others") {
    return (
      <div style={{ padding: 40 }}>
        <h2>Waiting for Other Players...</h2>
        <p>You have submitted your words/phrases. Please wait for other players to finish.</p>
      </div>
    );
  }

  else if (GAMEPLAY_PHASES.includes(gameState.serverState.gamePhase)) {
    return (
      <GamePlayScreen
        gameState={gameState}
        setGameState={setGameState}
        error={error}
        setError={setError}
        socket={socket}
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

  else {
    return (
      console.log("Unknown game state:\n", gameState) ||
      <div style={{ padding: 40 }}>
        <h1>Unknown Game State:</h1>
        <pre>{JSON.stringify(gameState, null, 2)}</pre>
      </div>
    );
  }
}

export default App;
