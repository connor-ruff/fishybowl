import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import StartScreen from "./components/StartScreen";
import LobbyScreen from "./components/LobbyScreen";
import PreGameConfigsScreen from "./components/PreGameConfigScreen";
import CollectWordsScreen from "./components/CollectWordsScreen";
import { useGameHandlers } from './hooks/useGameHandlers';

const socket = io("http://localhost:3001");

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
      setGameState(prev => ({ ...prev, serverState: serverState, clientState: { ...prev.clientState, clientGamePhase: "unknown" } }));
    });

    return () => {
      socket.off("update-players");
      socket.off("game-started");
      socket.off("all-words-submitted");
    };
  }, []);

  const { handleCreateRoom, handleJoinRoom, handleStartGame,
    handleSubmitGameConfig, handleSubmitWords
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
