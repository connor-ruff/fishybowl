// Durable client identity + draft storage.
//
// Everything here uses localStorage rather than sessionStorage: iOS Safari
// purges background tabs, and a player who closes the tab and comes back must
// land in the same seat without retyping anything.

const ID_KEY = 'fishybowl_session_id';
const SESSION_KEY = 'fishybowl_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing / storage full — fall back to in-memory only */
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (plain HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let sessionId = safeGet(ID_KEY);
if (!sessionId) {
  sessionId = generateId();
  safeSet(ID_KEY, sessionId);
}

export const SESSION_ID = sessionId;

// ─── Which room/name this device last used ───

export function saveSession(roomCode, playerName) {
  if (!roomCode || !playerName) return;
  safeSet(SESSION_KEY, JSON.stringify({ roomCode, playerName, savedAt: Date.now() }));
}

export function loadSession() {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.roomCode || !parsed.playerName) return null;
    if (Date.now() - (parsed.savedAt || 0) > SESSION_TTL_MS) {
      safeRemove(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    safeRemove(SESSION_KEY);
    return null;
  }
}

export function clearSession() {
  safeRemove(SESSION_KEY);
}

// ─── Draft storage ───
// Anything a player has typed but not submitted. Keyed by room so stale drafts
// from a previous game never leak into a new one.

function draftKey(kind, roomCode, playerName = '') {
  return `fishybowl_draft_${kind}_${roomCode}_${playerName}`;
}

export function saveDraft(kind, roomCode, playerName, value) {
  if (!roomCode) return;
  safeSet(draftKey(kind, roomCode, playerName), JSON.stringify(value));
}

export function loadDraft(kind, roomCode, playerName) {
  if (!roomCode) return null;
  const raw = safeGet(draftKey(kind, roomCode, playerName));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft(kind, roomCode, playerName) {
  if (!roomCode) return;
  safeRemove(draftKey(kind, roomCode, playerName));
}
