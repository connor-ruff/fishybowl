const SESSION_KEY = 'fishybowl_session_id';

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

let sessionId = sessionStorage.getItem(SESSION_KEY);
if (!sessionId) {
  sessionId = generateId();
  sessionStorage.setItem(SESSION_KEY, sessionId);
}

export const SESSION_ID = sessionId;
