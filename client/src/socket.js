import { io } from "socket.io-client";

// Reconnect forever with a short backoff. A party game on phone browsers sees
// constant brief drops (lock screen, app switch, weak wifi) and the only
// acceptable behaviour is to quietly come back.
export const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  randomizationFactor: 0.3,
  timeout: 10000
});

// Force a fresh transport. Used when the page wakes up holding a socket that
// looks connected but is actually dead — mobile browsers freeze timers while
// backgrounded, so socket.io's own heartbeat may not have noticed yet.
export function forceReconnect() {
  if (socket.connected) socket.disconnect();
  socket.connect();
}
