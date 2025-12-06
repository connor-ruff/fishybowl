import { useCallback } from "react";

export function useGameHandlers(socket, gameState, setGameState, setError) {
  const handleCreateRoom = useCallback(() => {
    if (!gameState.clientState.playerName) return alert("Enter your name first");
    
    socket.emit("create-room", gameState.clientState.playerName, (res) => {
      if (res.success) {
        setGameState(prev => ({
          ...prev,
          serverState: res.gameState,
          clientState: {
            ...prev.clientState,
            roomCode: res.roomCode,
            playerIsHost: true,
            clientGamePhase: "lobby"
          }
        }));
        setError("");
      }
    });
  }, [socket, gameState.clientState.playerName, setGameState, setError]);

  const handleJoinRoom = useCallback((roomCodeInput) => {
    if (!gameState.clientState.playerName || !roomCodeInput) {
      return alert("Enter name and room code");
    }
    
    socket.emit("join-room", { 
      roomCode: roomCodeInput, 
      playerName: gameState.clientState.playerName 
    }, (res) => {
      if (res.success) {
        setGameState(prev => ({
          ...prev,
          serverState: res.gameState,
          clientState: {
            ...prev.clientState,
            roomCode: res.roomCode,
            playerIsHost: false,
            clientGamePhase: "lobby"
          }
        }));
        setError("");
      } else {
        setError(res.error);
      }
    });
  }, [socket, gameState.clientState.playerName, setGameState, setError]);

    const handleStartGame = useCallback(() => {

        if (!gameState.clientState.playerIsHost) return alert("Only the host can start the game");

        socket.emit("start-game", gameState.clientState.roomCode, (res) => {
            // Do nothing for now; server will emit updates
            if (res.success) {
                setGameState(prev => ({
                    ...prev,
                    serverState: res.gameState,
                    clientState: {
                        ...prev.clientState,
                        clientGamePhase: "pre-game-configs"
                    }
                }));
                setError("");
            }
            else {
                setError(res.error);
            }
        });

  

    }, [socket, gameState.clientState.roomCode, setGameState, setError]);

  return { handleCreateRoom, handleJoinRoom, handleStartGame };
}