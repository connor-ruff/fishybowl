const express = require("express");
const { createServer } = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerConnectionHandlers } = require('./handlers/connectionHandlers');
const { registerGameHandlers } = require('./handlers/gameHandlers');

const app = express();
const httpServer = createServer(app);

const isDev = process.env.NODE_ENV !== "production";

const io = new Server(httpServer, {
  cors: isDev ? { origin: "*" } : undefined,
  // Phones throttle timers and drop connections when backgrounded. A relaxed
  // ping window means short lock-screen moments never register as a drop at
  // all; anything longer is handled by the per-player grace period.
  pingInterval: 20000,
  pingTimeout: 25000
  // Note: socket.io's connectionStateRecovery is deliberately NOT used. It
  // replays buffered events on reconnect, which can deliver a stale room
  // snapshot after the fresh one from our own rejoin handshake.
});

// In production, serve the built client files
if (!isDev) {
  app.use(express.static(path.join(__dirname, "../client/dist")));
}

// In-memory room store
const rooms = {};

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  registerRoomHandlers(io, socket, rooms);
  registerConnectionHandlers(io, socket, rooms);
  registerGameHandlers(io, socket, rooms);
});

// Basic visibility into live rooms
app.get("/healthz", (_, res) => {
  res.json({
    ok: true,
    rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((n, r) => n + r.players.length, 0)
  });
});

// SPA catch-all: serve index.html for any non-API/non-static route
if (!isDev) {
  app.get("/{*splat}", (_, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () =>
  console.log(`Server listening on port ${PORT}`)
);
