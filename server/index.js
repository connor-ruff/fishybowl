const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerConnectionHandlers } = require('./handlers/connectionHandlers');
const { registerGameHandlers } = require('./handlers/gameHandlers');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

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

// Optional: test endpoint
app.get("/", (_, res) => {
  res.send("Server is running");
});

const PORT = 3001;
httpServer.listen(PORT, () =>
  console.log(`Server listening on port ${PORT}`)
);
