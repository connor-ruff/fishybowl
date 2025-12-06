import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import StartScreen from "./components/StartScreen";
import LobbyScreen from "./components/LobbyScreen";
import PreGameConfigsScreen from "./components/PreGameConfigScreen";
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
      // TODO: Handle game started event
      console.log("Game started! Room data:", serverState);
      setGameState(prev => ({ ...prev, serverState: serverState, clientState: { ...prev.clientState, clientGamePhase: "pre-game-configs" } }));
      // You'll probably want to update gameState here
    });

    return () => {
      socket.off("update-players");
      socket.off("game-started");
    };
  }, []);

  const { handleCreateRoom, handleJoinRoom, handleStartGame } = useGameHandlers(socket, gameState, setGameState, setError);
  


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
      />
    );
  }

  else {
    return (
      console.log("Unknown game state:\n", gameState) ||
      <div style={{ padding: 40 }}>
        <h1>Unknown Game State</h1>
      </div>
    );
  }
}

export default App;
