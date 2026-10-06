# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fishybowl is an online multiplayer Fishbowl party game (word-guessing with 3 rounds of increasing difficulty). Built with a React client and Node.js/Express server communicating via Socket.IO.

## Development Commands

### Server (`/server`)
- `npm run dev` — Start server with nodemon (auto-reload), runs on port 3001
- `npm start` — Start server without auto-reload

### Client (`/client`)
- `npm run dev` — Start Vite dev server (port 5173)
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm run preview` — Preview production build

### Tests (`/server`)
- `npm test` — Boots a server on port 3099 with a short grace window and runs
  `test/disconnect.test.js` (presence, rejoin, host handoff, escape hatches) and
  `test/fullgame.test.js` (3-round playthrough, scoring, play-again).

No client-side test framework is configured.

## Architecture

### Client-Server Communication
All game state lives on the server in an in-memory `rooms` object (no database). The client and server communicate exclusively through Socket.IO events. The client emits actions, the server processes them and broadcasts updated state to all players in the room.

### Server (`/server/index.js`)
Express + Socket.IO server. Socket handlers are split into three modules:
- **roomHandlers.js** — Room creation/joining/rejoining, player removal, host transfer, config submission, word collection, game initialization
- **gameHandlers.js** — Round/turn lifecycle: start round, start turn, guess, skip, score adjustment, next turn/round, skip-waiting, end game, play again
- **connectionHandlers.js** — Disconnect handling, grace-period expiry, the `sync-state` liveness probe, explicit leave
- **utils/roomUtils.js** — Room codes, shuffle, turn timers, grace timers, cleanup timers, and the per-socket state projection
- **utils/playerUtils.js** — Clue-giver selection, host reassignment, player removal, and clue-giver-missing handling

### Client (`/client/src`)
- **App.jsx** — Central state manager. Maintains `gameState` (`serverState` from the socket plus a thin `clientState` for identity). Renders a component based on the derived screen.
- **socket.js** — The single Socket.IO instance plus reconnection config and `forceReconnect`
- **hooks/useGameHandlers.js** — Wraps every socket emission, with an ack timeout so no button silently does nothing
- **utils/session.js** — localStorage-backed identity (`SESSION_ID`), last-room memory, and draft storage
- **utils/clock.js** — `useSyncExternalStore` ticking clock for the turn countdown
- **Components**: `StartScreen` → `LobbyScreen` → `PreGameConfigScreen` → `CollectWordsScreen` → `WaitingForWordsScreen` → `GamePlayScreen`, plus the shared `ConnectionBanner` and `PlayerRoster`

### Game Phase Flow
`in-lobby` → `pre-game-configs` → `collecting-words` → `round-start` → `turn-ready` → `turn-active` → `turn-end` → `round-end` → (repeat for 3 rounds) → `game-over` → `play-again` (back to lobby)

### Key Patterns
- **Server owns the phase.** The client derives its screen from `serverState.gamePhase`; `clientState` holds only identity (name, room, host flag) and two client-only screens (`start-page`, `rejoining`).
- **Presence is per-player, never a room-wide state change.** A disconnect sets `connected: false` and starts a 45s grace timer (`GRACE_MS`); expiry sets `absent: true`. Neither ever changes `gamePhase` — this is the invariant that keeps setup from collapsing when a phone drops.
- **One thing can block play**: an absent clue giver sets `room.waitingFor`, which freezes the turn timer. The host can always skip or remove them.
- **Every blocking state has a host escape hatch**: `remove-player`, `force-start-game`, `skip-waiting`, `transfer-host`, `end-game`.
- **Per-socket state projection**: `stateFor()` strips undrawn words, other players' submissions, and session ids. `broadcastRoom()` emits it to each player individually — never `io.to(room).emit` with the raw room.
- **Clients persist everything typed.** Words and team config are drafted to localStorage so a reconnect or reload loses nothing.
- **Timers are absolute.** The server sends `turnEndsAt` (wall clock) and clients count down locally, so a drop doesn't desync the clock.
