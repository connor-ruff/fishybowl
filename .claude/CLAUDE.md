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

No test framework is configured.

## Architecture

### Client-Server Communication
All game state lives on the server in an in-memory `rooms` object (no database). The client and server communicate exclusively through Socket.IO events. The client emits actions, the server processes them and broadcasts updated state to all players in the room.

### Server (`/server/index.js`)
Express + Socket.IO server. Socket handlers are split into three modules:
- **roomHandlers.js** — Room creation/joining, game start, config submission, word collection
- **gameHandlers.js** — Round/turn lifecycle: start round, start turn, guess, skip, score adjustment, next turn/round, play again
- **connectionHandlers.js** — Disconnect detection, auto-pause during active turns, auto-rejoin with state restoration
- **roomUtils.js** — Shared helpers (room codes, shuffle, timer management)

### Client (`/client/src`)
- **App.jsx** — Central state manager. Maintains `gameState` (combining `serverState` from socket events and local `clientState` for phase tracking). Renders components based on current game phase.
- **hooks/useGameHandlers.js** — Custom hook wrapping all socket emissions into callable functions
- **Components** map 1:1 to game phases: `StartScreen` → `LobbyScreen` → `PreGameConfigScreen` → `CollectWordsScreen` → `GamePlayScreen`

### Game Phase Flow
`start` → `lobby` → `pre-game-config` → `collecting-words` → `round-start` → `turn-ready` → `turn-active` → `turn-end` → `round-end` → (repeat for 3 rounds) → `game-over` → `play-again` (back to lobby)

### Key Patterns
- **Phase-based rendering**: App.jsx switches displayed component based on `clientState.phase`
- **Socket.IO callbacks**: Client uses acknowledgment callbacks for request-response style error handling
- **Broadcast model**: Server emits full room state to all players after each action
- **Rejoin logic**: Players auto-reconnect and restore state on network drops
