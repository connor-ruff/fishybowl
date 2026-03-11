const SESSION_KEY = 'fishybowl_session_id';

let sessionId = sessionStorage.getItem(SESSION_KEY);
if (!sessionId) {
  sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
}

export const SESSION_ID = sessionId;
