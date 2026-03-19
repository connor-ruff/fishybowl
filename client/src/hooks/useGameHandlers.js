import { useCallback } from "react";
import { SESSION_ID } from "../utils/session";

export function useGameHandlers(socket, gameState, setGameState, setError) {
  const handleCreateRoom = useCallback(() => {
    if (!gameState.clientState.playerName) return alert("Enter your name first");

    socket.emit("create-room", { playerName: gameState.clientState.playerName, sessionId: SESSION_ID }, (res) => {
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
      playerName: gameState.clientState.playerName,
      sessionId: SESSION_ID
    }, (res) => {
      if (res.success) {
        if (res.isRejoin) {
          setGameState(prev => ({
            ...prev,
            serverState: res.gameState,
            clientState: {
              ...prev.clientState,
              roomCode: res.roomCode,
              playerIsHost: res.isHost,
              clientGamePhase: res.gameState.gamePhase
            }
          }));
        } else {
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
        }
        setError("");
      } else {
        setError(res.error);
      }
    });
  }, [socket, gameState.clientState.playerName, setGameState, setError]);

  const handleStartGame = useCallback(() => {

        if (!gameState.clientState.playerIsHost) return alert("Only the host can start the game");

        if (!window.confirm("Start the game? No new players will be able to join after this.")) return;

        socket.emit("start-game", gameState.clientState.roomCode, (res) => {
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

    const handleSubmitGameConfig = useCallback((config) => {

        if (!gameState.clientState.playerIsHost) {
          return alert("Only the host can submit game configuration");
        }


        socket.emit("submit-game-config", gameState.clientState.roomCode, config, (res) => {
            if (res.success) {
                setGameState(prev => ({
                    ...prev,
                    serverState: res.gameState,
                    clientState: {
                        ...prev.clientState,
                        clientGamePhase: "collecting-words"
                    }
                }));
                setError("");
            } else {
                setError(res.error);
                alert("Failed to submit configuration: " + res.error);
            }
        });

    }, [socket, gameState, setGameState, setError]);

    const handleSubmitWords = useCallback((words) => {

      socket.emit("submit-words", gameState.clientState.roomCode, gameState.clientState.playerName, words, (res) => {
          if (res.success) {
              setGameState(prev => ({
                  ...prev,
                  serverState: res.gameState,
                  clientState: {
                      ...prev.clientState,
                      clientGamePhase: "collecting-words-waiting-for-others"
                  }
              }));
              setError("");
          } else {
              setError(res.error);
              alert("Failed to submit words: " + res.error);
          }
        });
    }, [socket, gameState, setGameState, setError]);

    // Helper for gameplay actions that all follow the same pattern
    const emitGameAction = useCallback((event) => {
        socket.emit(event, gameState.clientState.roomCode, (res) => {
            if (res.success) {
                setGameState(prev => {
                    let newPhase = res.gameState.gamePhase;
                    // If resuming back to collecting-words, check if this player already submitted
                    if (newPhase === "collecting-words") {
                        const myName = prev.clientState.playerName;
                        const alreadySubmitted = myName && res.gameState.playerLookup?.[myName]?.wordsSubmitted;
                        if (alreadySubmitted) {
                            newPhase = "collecting-words-waiting-for-others";
                        }
                    }
                    return {
                        ...prev,
                        serverState: res.gameState,
                        clientState: { ...prev.clientState, clientGamePhase: newPhase }
                    };
                });
            } else {
                setError(res.error);
            }
        });
    }, [socket, gameState.clientState.roomCode, setGameState, setError]);

    const handleResumeGame = useCallback(() => emitGameAction("resume-game"), [emitGameAction]);
    const handleStartRound = useCallback(() => emitGameAction("start-round"), [emitGameAction]);
    const handleStartTurn = useCallback(() => emitGameAction("start-turn"), [emitGameAction]);
    const handleWordGuessed = useCallback(() => emitGameAction("word-guessed"), [emitGameAction]);
    const handleSkipWord = useCallback(() => emitGameAction("skip-word"), [emitGameAction]);
    const handleNextTurn = useCallback(() => emitGameAction("next-turn"), [emitGameAction]);
    const handleNextRound = useCallback(() => emitGameAction("next-round"), [emitGameAction]);
    const handlePlayAgain = useCallback(() => emitGameAction("play-again"), [emitGameAction]);

    const handleAdjustScore = useCallback((teamName, delta) => {
        socket.emit("adjust-score", gameState.clientState.roomCode, teamName, delta, (res) => {
            if (res.success) {
                setGameState(prev => ({
                    ...prev,
                    serverState: res.gameState,
                    clientState: { ...prev.clientState, clientGamePhase: res.gameState.gamePhase }
                }));
            }
        });
    }, [socket, gameState.clientState.roomCode, setGameState]);

    const handleRetryRejoin = useCallback(() => {
        const { roomCode, playerName } = gameState.clientState;
        if (!roomCode || !playerName) return;

        socket.emit("join-room", { roomCode, playerName, sessionId: SESSION_ID }, (res) => {
            if (res.success) {
                setGameState(prev => ({
                    ...prev,
                    serverState: res.gameState,
                    clientState: {
                        ...prev.clientState,
                        roomCode: res.roomCode,
                        playerIsHost: res.isHost || prev.clientState.playerIsHost,
                        clientGamePhase: res.gameState.gamePhase
                    }
                }));
                setError("");
            } else {
                setError(res.error || "Failed to rejoin");
            }
        });
    }, [socket, gameState.clientState, setGameState, setError]);

    const handleReturnToStart = useCallback(() => {
        setGameState({
            serverState: null,
            clientState: {
                playerName: null,
                playerIsHost: null,
                clientGamePhase: "start-page",
                roomCode: null
            }
        });
        setError("");
    }, [setGameState, setError]);

  return {
    handleCreateRoom, handleJoinRoom, handleStartGame, handleSubmitGameConfig, handleSubmitWords,
    handleResumeGame, handleStartRound, handleStartTurn, handleWordGuessed, handleSkipWord,
    handleNextTurn, handleNextRound, handlePlayAgain, handleAdjustScore,
    handleRetryRejoin, handleReturnToStart
  };
}
