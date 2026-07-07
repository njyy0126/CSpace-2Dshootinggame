import express from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { getPort } from "./config";
import { registerHandlers } from "./socket/registerHandlers";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

registerHandlers(io);

app.use(express.static(path.resolve("dist/client")));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve("dist/client/index.html"));
});

server.listen(getPort(), () => {
  console.log("Server listening on port", getPort());
});
