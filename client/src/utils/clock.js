// A shared ticking clock for `useSyncExternalStore`.
//
// The turn countdown is derived from the server's absolute `turnEndsAt`, which
// means render output depends on the current time. Reading `Date.now()` during
// render is impure, so the current time is modelled as an external store that
// components subscribe to instead.

const listeners = new Set();
let snapshot = Date.now();
let timer = null;

function tick() {
  snapshot = Date.now();
  listeners.forEach(listener => listener());
}

export function subscribeClock(listener) {
  listeners.add(listener);
  if (!timer) {
    snapshot = Date.now();
    timer = setInterval(tick, 200);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getClockSnapshot() {
  return snapshot;
}
