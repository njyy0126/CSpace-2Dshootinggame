import { MATCH_TARGETS, MAX_PLAYERS, PICKUP_SPAWN_INTERVAL_MS } from "../../shared/constants";
import { getMapSpawnPoints, getMapWalls, isMapId } from "../../shared/map";
import type { MapId, MatchTarget, PlayerClass } from "../../shared/types";
import {
  createDefaultInputState,
  createPlayer,
  createRoomState,
  getPlayerColor,
  resetPlayerForRound,
  type RoomState
} from "../game/state";
import { createRoomCode } from "./roomCode";

export function createRoomStore() {
  const rooms = new Map<string, RoomState>();

  function generateUniqueCode() {
    let code = createRoomCode();

    while (rooms.has(code)) {
      code = createRoomCode();
    }

    return code;
  }

  function getEligiblePlayerCount(room: RoomState) {
    return Object.values(room.players).filter((player) => !player.waitingForNextRound).length;
  }

  function resetArenaState(room: RoomState) {
    const now = Date.now();
    const spawnPoints = getMapSpawnPoints(room.mapId);

    room.activeProjectiles = {};
    room.activeLasers = {};
    room.activeBombs = {};
    room.activePickups = {};
    room.nextPickupSpawnAt = now + PICKUP_SPAWN_INTERVAL_MS;
    room.pickupSpawnCount = 0;
    room.walls = getMapWalls(room.mapId);
    room.lastTickAt = now;

    let spawnIndex = 0;
    for (const player of Object.values(room.players)) {
      const spawn = spawnPoints[spawnIndex % spawnPoints.length]!;
      spawnIndex += 1;

      resetPlayerForRound(player, spawn);
      room.playerInputs[player.id] = createDefaultInputState(player);
    }
  }

  function returnToLobby(room: RoomState) {
    room.phase = "lobby";
    room.winnerId = null;
    room.celebrationEndsAt = null;
    resetArenaState(room);
  }

  function getPlayerRooms(socketId: string) {
    return [...rooms.values()].filter((room) => Boolean(room.players[socketId]));
  }

  return {
    createRoom(socketId: string, nickname: string) {
      if (getPlayerRooms(socketId).length > 0) {
        throw new Error("Player is already in a room");
      }

      const room = createRoomState(generateUniqueCode(), socketId, nickname);
      rooms.set(room.code, room);
      return room;
    },
    joinRoom(code: string, socketId: string, nickname: string) {
      const room = rooms.get(code);

      if (!room) {
        return null;
      }

      if (Object.keys(room.players).length >= MAX_PLAYERS) {
        throw new Error("Room is full");
      }

      if (getPlayerRooms(socketId).length > 0) {
        throw new Error("Player is already in a room");
      }

      if (room.phase === "playing" && getEligiblePlayerCount(room) < 2) {
        returnToLobby(room);
      }

      const playerIndex = Object.keys(room.players).length;
      const spawnPoints = getMapSpawnPoints(room.mapId);
      const player = createPlayer(
        socketId,
        nickname,
        getPlayerColor(playerIndex),
        spawnPoints[playerIndex % spawnPoints.length]!
      );
      player.waitingForNextRound = room.phase !== "lobby";
      player.alive = room.phase === "lobby";
      room.players[socketId] = player;
      room.playerInputs[socketId] = createDefaultInputState(player);

      return room;
    },
    updatePlayerClass(roomCode: string, socketId: string, classType: PlayerClass) {
      const room = rooms.get(roomCode);
      if (!room || room.phase !== "lobby") {
        return null;
      }

      const player = room.players[socketId];
      if (!player) {
        return null;
      }

      player.classType = classType;
      return room;
    },
    setMatchTarget(room: RoomState, target: MatchTarget) {
      if (!MATCH_TARGETS.includes(target)) {
        throw new Error("Invalid target");
      }

      room.matchTarget = target;
    },
    updateMatchTarget(roomCode: string, socketId: string, target: MatchTarget) {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socketId || room.phase !== "lobby") {
        return null;
      }

      this.setMatchTarget(room, target);
      return room;
    },
    setMap(room: RoomState, mapId: MapId) {
      if (!isMapId(mapId)) {
        throw new Error("Invalid map");
      }

      room.mapId = mapId;
      resetArenaState(room);
    },
    updateMap(roomCode: string, socketId: string, mapId: MapId) {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socketId || room.phase !== "lobby") {
        return null;
      }

      this.setMap(room, mapId);
      return room;
    },
    startMatch(room: RoomState) {
      if (room.phase !== "lobby" || Object.keys(room.players).length < 2) {
        return false;
      }

      room.phase = "playing";
      room.winnerId = null;
      room.celebrationEndsAt = null;
      resetArenaState(room);

      return true;
    },
    startMatchByHost(roomCode: string, socketId: string) {
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== socketId) {
        return null;
      }

      if (!this.startMatch(room)) {
        return null;
      }

      return room;
    },
    listRooms() {
      return [...rooms.values()];
    },
    listRoomSummaries() {
      return [...rooms.values()]
        .map((room) => ({
          code: room.code,
          hostNickname: room.players[room.hostId]?.nickname ?? "Unknown",
          playerCount: Object.keys(room.players).length,
          phase: room.phase,
          mapId: room.mapId
        }))
        .sort((left, right) => left.code.localeCompare(right.code));
    },
    removePlayerEverywhere(socketId: string) {
      const affectedRooms: RoomState[] = [];

      for (const room of getPlayerRooms(socketId)) {
        if (!room.players[socketId]) {
          continue;
        }

        delete room.players[socketId];
        delete room.playerInputs[socketId];

        const remainingIds = Object.keys(room.players);
        if (room.hostId === socketId) {
          room.hostId = remainingIds[0] ?? "";
        }

        if (remainingIds.length === 0) {
          rooms.delete(room.code);
          continue;
        }

        if (room.phase === "playing" && getEligiblePlayerCount(room) < 2) {
          returnToLobby(room);
        }

        affectedRooms.push(room);
      }

      return affectedRooms;
    },
    leaveRoom(roomCode: string, socketId: string) {
      const room = rooms.get(roomCode);
      if (!room || !room.players[socketId]) {
        return null;
      }

      delete room.players[socketId];
      delete room.playerInputs[socketId];

      const remainingIds = Object.keys(room.players);
      if (room.hostId === socketId) {
        room.hostId = remainingIds[0] ?? "";
      }

      if (remainingIds.length === 0) {
        rooms.delete(room.code);
        return null;
      }

      if (room.phase === "playing" && getEligiblePlayerCount(room) < 2) {
        returnToLobby(room);
      }

      return room;
    },
    removePlayer(socketId: string) {
      return this.removePlayerEverywhere(socketId)[0] ?? null;
    },
    getRoom(code: string) {
      return rooms.get(code);
    }
  };
}
