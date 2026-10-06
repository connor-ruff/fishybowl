import { useState, useEffect, useRef, useCallback } from "react";
import StartScreen from "./components/StartScreen";
import LobbyScreen from "./components/LobbyScreen";
import PreGameConfigsScreen from "./components/PreGameConfigScreen";
import CollectWordsScreen from "./components/CollectWordsScreen";
import WaitingForWordsScreen from "./components/WaitingForWordsScreen";
import GamePlayScreen from "./components/GamePlayScreen";
import ConnectionBanner from "./components/ConnectionBanner";
import { useGameHandlers } from './hooks/useGameHandlers';
import { socket, forceReconnect } from './socket';
import { SESSION_ID, loadSession, saveSession, clearSession } from './utils/session';

const GAMEPLAY_PHASES = [
  "round-start", "turn-ready", "turn-active", "turn-end", "round-end", "game-over"
];

// The server owns the phase. The only two screens the client decides on its own
// are the pre-room start page and the rejoin handshake; everything else is read
// straight off the latest server snapshot.
function deriveScreen(serverState, localPhase, playerName) {
  if (localPhase) return localPhase;
  if (!serverState) return "start-page";

  const phase = serverState.gamePhase;
  if (phase === "in-lobby") return "lobby";
  if (phase === "collecting-words") {
    return serverState.playerLookup?.[playerName]?.wordsSubmitted
      ? "words-waiting"
      : "collecting-words";
  }
  return phase;
}

function App() {
  const [gameState, setGameState] = useState({
    serverState: null,
    clientState: {
      playerName: "",
      playerIsHost: false,
      roomCode: "",
      // null means "follow the server"; a string pins a client-only screen
      localPhase: "start-page"
    }
  });
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Kept in a ref so socket listeners never read stale state
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Applies a server snapshot. Note what this does NOT do: it never pulls the
  // player off their current screen for someone else's connection trouble.
  const applyServerState = useCallback((serverState) => {
    setGameState(prev => {
      const myName = serverState.you?.name || prev.clientState.playerName;
      return {
        serverState,
        clientState: {
          ...prev.clientState,
          playerName: myName,
          playerIsHost: serverState.you
            ? serverState.you.is_host
            : prev.clientState.playerIsHost,
          roomCode: serverState.code || prev.clientState.roomCode,
          localPhase: null
        }
      };
    });
  }, []);

  const resetToStart = useCallback((message = "") => {
    clearSession();
    setGameState(prev => ({
      serverState: null,
      clientState: {
        playerName: prev.clientState.playerName,
        playerIsHost: false,
        roomCode: "",
        localPhase: "start-page"
      }
    }));
    setError("");
    setNotice(message);
  }, []);

  const attemptRejoin = useCallback((roomCode, playerName, { showScreen } = {}) => {
    if (showScreen) {
      setGameState(prev => ({
        ...prev,
        clientState: { ...prev.clientState, roomCode, playerName, localPhase: "rejoining" }
      }));
    }
    socket.emit("join-room", { roomCode, playerName, sessionId: SESSION_ID }, (res) => {
      if (res?.success) {
        saveSession(res.roomCode, res.gameState.you?.name || playerName);
        applyServerState(res.gameState);
        setError("");
      } else {
        resetToStart(res?.error || "Couldn't get you back into that game.");
      }
    });
  }, [applyServerState, resetToStart]);

  // ─── Server snapshots ───
  useEffect(() => {
    const onRemoved = () => resetToStart("The host removed you from the game.");

    socket.on("game-state-update", applyServerState);
    socket.on("removed-from-room", onRemoved);
    return () => {
      socket.off("game-state-update", applyServerState);
      socket.off("removed-from-room", onRemoved);
    };
  }, [applyServerState, resetToStart]);

  // ─── Connection lifecycle ───
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // Fall back to stored session: on a cold page load the socket can
      // connect before React has finished wiring up state.
      const live = gameStateRef.current.clientState;
      const target = live.roomCode && live.playerName ? live : loadSession();
      if (target?.roomCode && target?.playerName) {
        attemptRejoin(target.roomCode, target.playerName);
      }
    };
    const onDisconnect = () => setConnected(false);
    setConnected(socket.connected);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [attemptRejoin]);

  // ─── Wake-up watchdog ───
  // The critical mobile case: Safari freezes the tab, the socket dies silently,
  // and on return the client still believes it's connected. Probe the server on
  // every wake-up and force a new transport if it doesn't answer.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (!socket.connected) {
        socket.connect();
        return;
      }
      const { roomCode } = gameStateRef.current.clientState;
      if (!roomCode) return;
      socket.timeout(4000).emit("sync-state", roomCode, (err, res) => {
        if (err) {
          forceReconnect();
        } else if (res?.success) {
          applyServerState(res.gameState);
        }
      });
    };

    window.addEventListener("visibilitychange", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const interval = setInterval(check, 15000);
    return () => {
      window.removeEventListener("visibilitychange", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      clearInterval(interval);
    };
  }, [applyServerState]);

  // Nudge page padding so the fixed banner never covers the card
  useEffect(() => {
    document.body.classList.toggle("conn-offline", !connected);
    return () => document.body.classList.remove("conn-offline");
  }, [connected]);

  // ─── Resume a game after a refresh or tab close ───
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    if (socket.connected) {
      attemptRejoin(saved.roomCode, saved.playerName, { showScreen: true });
    } else {
      setGameState(prev => ({
        ...prev,
        clientState: {
          ...prev.clientState,
          roomCode: saved.roomCode,
          playerName: saved.playerName,
          localPhase: "rejoining"
        }
      }));
    }
    // Intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlers = useGameHandlers(socket, gameState, setGameState, setError, {
    applyServerState,
    resetToStart
  });

  const screen = deriveScreen(
    gameState.serverState,
    gameState.clientState.localPhase,
    gameState.clientState.playerName
  );

  const shared = { gameState, setGameState, error, setError, ...handlers };

  const body = (() => {
    switch (screen) {
      case "start-page":
        return <StartScreen {...shared} notice={notice} setNotice={setNotice} />;

      case "rejoining":
        return (
          <div className="page">
            <div className="card card-center">
              <h1 className="title title-sm">Rejoining&hellip;</h1>
              <p className="muted">
                Getting you back into room <strong>{gameState.clientState.roomCode}</strong>
              </p>
              <button
                className="btn-secondary"
                onClick={() => resetToStart()}
                style={{ marginTop: '1rem' }}
              >
                Start over
              </button>
            </div>
          </div>
        );

      case "lobby":
        return <LobbyScreen {...shared} />;

      case "pre-game-configs":
        return <PreGameConfigsScreen {...shared} />;

      case "collecting-words":
        return <CollectWordsScreen {...shared} />;

      case "words-waiting":
        return <WaitingForWordsScreen {...shared} />;

      default:
        if (GAMEPLAY_PHASES.includes(screen)) {
          return <GamePlayScreen {...shared} />;
        }
        return (
          <div className="page">
            <div className="card card-center">
              <h1 className="title title-sm">Something went sideways</h1>
              <p className="muted">
                The game is in an unexpected state{screen ? ` ("${screen}")` : ""}.
              </p>
              <button className="btn-primary" onClick={() => resetToStart()}>
                Back to start
              </button>
            </div>
          </div>
        );
    }
  })();

  return (
    <>
      <ConnectionBanner connected={connected} onRetry={forceReconnect} />
      {body}
    </>
  );
}

export default App;
