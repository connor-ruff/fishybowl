import { useCallback, useMemo } from "react";
import { SESSION_ID, saveSession, clearDraft } from "../utils/session";

const ACK_TIMEOUT_MS = 8000;

export function useGameHandlers(socket, gameState, setGameState, setError, { applyServerState, resetToStart }) {
  const { roomCode, playerName, playerIsHost } = gameState.clientState;

  // Every action goes through here. The ack is time-limited so a button never
  // silently does nothing when the connection is struggling — the player gets
  // told to wait rather than tapping into the void.
  const emit = useCallback((event, args = [], { onSuccess } = {}) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, ...args, (err, res) => {
      if (err) {
        setError("No response from the server — check your connection and try again.");
        return;
      }
      if (res?.success) {
        setError("");
        if (res.gameState) applyServerState(res.gameState);
        if (onSuccess) onSuccess(res);
      } else {
        setError(res?.error || "Something went wrong.");
      }
    });
  }, [socket, setError, applyServerState]);

  const handleCreateRoom = useCallback(() => {
    const name = (playerName || "").trim();
    if (!name) return setError("Enter your name first");

    emit("create-room", [{ playerName: name, sessionId: SESSION_ID }], {
      onSuccess: (res) => saveSession(res.roomCode, name)
    });
  }, [emit, playerName, setError]);

  const handleJoinRoom = useCallback((roomCodeInput) => {
    const name = (playerName || "").trim();
    const code = (roomCodeInput || "").trim().toUpperCase();
    if (!name) return setError("Enter your name first");
    if (!code) return setError("Enter a room code");

    emit("join-room", [{ roomCode: code, playerName: name, sessionId: SESSION_ID }], {
      onSuccess: (res) => saveSession(res.roomCode, res.gameState?.you?.name || name)
    });
  }, [emit, playerName, setError]);

  const handleStartGame = useCallback(() => {
    if (!playerIsHost) return setError("Only the host can start the game");
    emit("start-game", [roomCode]);
  }, [emit, roomCode, playerIsHost, setError]);

  const handleSubmitGameConfig = useCallback((config) => {
    if (!playerIsHost) return setError("Only the host can configure the game");
    emit("submit-game-config", [roomCode, config], {
      onSuccess: () => clearDraft("config", roomCode, "")
    });
  }, [emit, roomCode, playerIsHost, setError]);

  const handleSubmitWords = useCallback((words) => {
    emit("submit-words", [roomCode, playerName, words], {
      onSuccess: () => clearDraft("words", roomCode, playerName)
    });
  }, [emit, roomCode, playerName]);

  const handleRemovePlayer = useCallback((name) => {
    emit("remove-player", [roomCode, name]);
  }, [emit, roomCode]);

  const handleTransferHost = useCallback((name) => {
    emit("transfer-host", [roomCode, name]);
  }, [emit, roomCode]);

  const handleLeaveRoom = useCallback(() => {
    socket.emit("leave-room", roomCode, () => {});
    resetToStart();
  }, [socket, roomCode, resetToStart]);

  const simple = useMemo(() => ({
    handleForceStartGame: () => emit("force-start-game", [roomCode]),
    handleSkipWaiting: () => emit("skip-waiting", [roomCode]),
    handleStartRound: () => emit("start-round", [roomCode]),
    handleStartTurn: () => emit("start-turn", [roomCode]),
    handleWordGuessed: () => emit("word-guessed", [roomCode]),
    handleSkipWord: () => emit("skip-word", [roomCode]),
    handleNextTurn: () => emit("next-turn", [roomCode]),
    handleNextRound: () => emit("next-round", [roomCode]),
    handleEndGame: () => emit("end-game", [roomCode]),
    handlePlayAgain: () => emit("play-again", [roomCode])
  }), [emit, roomCode]);

  const handleAdjustScore = useCallback((teamName, delta) => {
    emit("adjust-score", [roomCode, teamName, delta]);
  }, [emit, roomCode]);

  return {
    handleCreateRoom,
    handleJoinRoom,
    handleStartGame,
    handleSubmitGameConfig,
    handleSubmitWords,
    handleRemovePlayer,
    handleTransferHost,
    handleLeaveRoom,
    handleAdjustScore,
    ...simple
  };
}
