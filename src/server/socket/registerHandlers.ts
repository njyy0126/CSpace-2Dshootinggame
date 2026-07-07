import type { Server, Socket } from "socket.io";
import { SERVER_TICK_MS } from "../../shared/constants";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type InputPayload,
  type JoinRoomPayload,
  type SetPlayerClassPayload,
  type SetMapPayload,
  type SetMatchTargetPayload,
  type StartMatchPayload
} from "../../shared/messages";
import { isPlayerClass } from "../../shared/playerClass";
import { clamp, normalize } from "../../shared/math";
import { resolvePlayerMovement } from "../game/collision";
import { createEngine } from "../game/engine";
import type { RoomState } from "../game/state";
import { createRoomStore } from "../rooms/roomStore";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidInputPayload(payload: InputPayload) {
  return (
    typeof payload.roomCode === "string" &&
    isFiniteNumber(payload.moveX) &&
    isFiniteNumber(payload.moveY) &&
    isFiniteNumber(payload.aimX) &&
    isFiniteNumber(payload.aimY) &&
    typeof payload.firing === "boolean"
  );
}

export function applyInputPayloadToRoom(room: RoomState, socketId: string, payload: InputPayload, now = Date.now()) {
  const player = room.players[socketId];
  if (!player || !isValidInputPayload(payload)) {
    return false;
  }

  const previousInput = room.playerInputs[socketId];
  const moveX = clamp(payload.moveX, -1, 1);
  const moveY = clamp(payload.moveY, -1, 1);

  room.playerInputs[socketId] = {
    moveX,
    moveY,
    aimX: payload.aimX,
    aimY: payload.aimY,
    firing: payload.firing,
    fireQueued: Boolean(previousInput?.fireQueued || payload.firing),
    lastUpdatedAt: now,
    lastFiredAt: previousInput?.lastFiredAt ?? 0
  };

  player.aim = normalize({
    x: payload.aimX - player.x,
    y: payload.aimY - player.y
  });

  if (room.phase === "lobby") {
    const nextPosition = resolvePlayerMovement(player.x, player.y, moveX * 8, moveY * 8, room.walls);
    player.x = nextPosition.x;
    player.y = nextPosition.y;
  }

  return true;
}

export function registerHandlers(io: Server) {
  const store = createRoomStore();
  const engine = createEngine();

  function emitRoomStateUpdates(rooms: RoomState[]) {
    const emitted = new Set<string>();

    for (const room of rooms) {
      if (emitted.has(room.code)) {
        continue;
      }

      emitted.add(room.code);
      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    }
  }

  function leaveJoinedGameRooms(socket: Socket) {
    for (const roomCode of [...socket.rooms]) {
      if (roomCode === socket.id) {
        continue;
      }

      void socket.leave(roomCode);
    }
  }

  setInterval(() => {
    const now = Date.now();

    for (const room of store.listRooms()) {
      if (room.phase === "playing") {
        engine.tickRoom(room, now);
        io.to(room.code).emit(SERVER_EVENTS.roomState, room);
      } else if (room.phase === "celebration") {
        engine.tickCelebration(room, now);
        engine.resetAfterCelebration(room, now);
        io.to(room.code).emit(SERVER_EVENTS.roomState, room);
      } else {
        engine.tickLobby(room, now);
      }
    }
  }, SERVER_TICK_MS);

  io.on("connection", (socket: Socket) => {
    socket.on(CLIENT_EVENTS.createRoom, ({ nickname }: { nickname: string }) => {
      let room: ReturnType<typeof store.createRoom>;

      try {
        const departedRooms = store.removePlayerEverywhere(socket.id);
        leaveJoinedGameRooms(socket);
        emitRoomStateUpdates(departedRooms);
        room = store.createRoom(socket.id, nickname.trim());
      } catch (error) {
        socket.emit(SERVER_EVENTS.roomError, {
          message: error instanceof Error ? error.message : "Unable to create room"
        });
        return;
      }

      socket.join(room.code);
      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.joinRoom, ({ roomCode, nickname }: JoinRoomPayload) => {
      let room: ReturnType<typeof store.joinRoom> = null;

      try {
        const departedRooms = store.removePlayerEverywhere(socket.id);
        leaveJoinedGameRooms(socket);
        emitRoomStateUpdates(departedRooms);
        room = store.joinRoom(roomCode.trim().toUpperCase(), socket.id, nickname.trim());
      } catch (error) {
        socket.emit(SERVER_EVENTS.roomError, {
          message: error instanceof Error ? error.message : "Unable to join room"
        });
        return;
      }

      if (!room) {
        socket.emit(SERVER_EVENTS.roomError, {
          message: "Room not found"
        });
        return;
      }

      socket.join(room.code);
      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.requestRoomList, () => {
      socket.emit(SERVER_EVENTS.roomList, {
        rooms: store.listRoomSummaries()
      });
    });

    socket.on(CLIENT_EVENTS.setMatchTarget, ({ roomCode, target }: SetMatchTargetPayload) => {
      const room = store.updateMatchTarget(roomCode, socket.id, target);
      if (!room) {
        return;
      }

      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.setMap, ({ roomCode, mapId }: SetMapPayload) => {
      const room = store.updateMap(roomCode, socket.id, mapId);
      if (!room) {
        return;
      }

      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.setPlayerClass, ({ roomCode, classType }: SetPlayerClassPayload) => {
      if (!isPlayerClass(classType)) {
        return;
      }

      const room = store.updatePlayerClass(roomCode, socket.id, classType);
      if (!room) {
        return;
      }

      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.startMatch, ({ roomCode }: StartMatchPayload) => {
      const room = store.startMatchByHost(roomCode, socket.id);
      if (!room) {
        return;
      }

      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.leaveRoom, async ({ roomCode }) => {
      if (typeof roomCode !== "string") {
        return;
      }

      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const room = store.leaveRoom(normalizedRoomCode, socket.id);
      await socket.leave(normalizedRoomCode);

      if (!room) {
        return;
      }

      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });

    socket.on(CLIENT_EVENTS.input, (payload: InputPayload) => {
      if (!payload || typeof payload.roomCode !== "string") {
        return;
      }

      const room = store.getRoom(payload.roomCode);
      if (!room) {
        return;
      }

      applyInputPayloadToRoom(room, socket.id, payload);
    });

    socket.on("disconnect", () => {
      const affectedRooms = store.removePlayerEverywhere(socket.id);
      if (affectedRooms.length === 0) {
        return;
      }

      emitRoomStateUpdates(affectedRooms);
    });
  });
}
