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
});

// In production, serve the built client files
if (!isDev) {
  app.use(express.static(path.join(__dirname, "../client/dist")));
}

// In-memory room store
const rooms = {};


io.on("connection", (socket) => {
    console.log("A client connected:", socket.id);
    // Send a message to this client
    socket.emit("hello-from-server", "Hello from server!");

    registerRoomHandlers(io, socket, rooms);
    registerConnectionHandlers(io, socket, rooms);
    registerGameHandlers(io, socket, rooms);


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
