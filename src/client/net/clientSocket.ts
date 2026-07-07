import { io } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type InputPayload,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type RoomErrorPayload,
  type ServerRoomListPayload,
  type SetMapPayload,
  type SetMatchTargetPayload,
  type SetPlayerClassPayload,
  type StartMatchPayload
} from "../../shared/messages";
import type { MapId, PlayerClass } from "../../shared/types";
import {
  setRoomListLoading,
  updateErrorMessage,
  updateLocalPlayerId,
  updateRoom,
  updateRoomList
} from "../state/clientState";

declare global {
  interface Window {
    __FPS_SOCKET__?: ClientSocketApi;
  }
}

export interface ClientSocketApi {
  socket: ReturnType<typeof io>;
  createRoom(nickname: string): void;
  joinRoom(roomCode: string, nickname: string): void;
  requestRoomList(): void;
  setMatchTarget(roomCode: string, target: 10 | 20 | 30): void;
  setMap(roomCode: string, mapId: MapId): void;
  setPlayerClass(roomCode: string, classType: PlayerClass): void;
  startMatch(roomCode: string): void;
  leaveRoom(roomCode: string): void;
  sendInput(payload: InputPayload): void;
}

let activeClientSocket: ClientSocketApi | null = null;

export function createClientSocket() {
  const socket = io();

  socket.on("connect", () => {
    updateLocalPlayerId(socket.id ?? null);
  });

  socket.on(SERVER_EVENTS.roomState, (room) => {
    updateRoom(room);
    updateErrorMessage(null);
  });

  socket.on(SERVER_EVENTS.roomList, ({ rooms }: ServerRoomListPayload) => {
    updateRoomList(rooms);
    setRoomListLoading(false);
  });

  socket.on(SERVER_EVENTS.roomError, ({ message }: RoomErrorPayload) => {
    updateErrorMessage(message);
    setRoomListLoading(false);
  });

  activeClientSocket = {
    socket,
    createRoom(nickname: string) {
      socket.emit(CLIENT_EVENTS.createRoom, { nickname });
    },
    joinRoom(roomCode: string, nickname: string) {
      const payload: JoinRoomPayload = { roomCode, nickname };
      socket.emit(CLIENT_EVENTS.joinRoom, payload);
    },
    requestRoomList() {
      socket.emit(CLIENT_EVENTS.requestRoomList);
    },
    setMatchTarget(roomCode: string, target: 10 | 20 | 30) {
      const payload: SetMatchTargetPayload = { roomCode, target };
      socket.emit(CLIENT_EVENTS.setMatchTarget, payload);
    },
    setMap(roomCode: string, mapId: MapId) {
      const payload: SetMapPayload = { roomCode, mapId };
      socket.emit(CLIENT_EVENTS.setMap, payload);
    },
    setPlayerClass(roomCode: string, classType: PlayerClass) {
      const payload: SetPlayerClassPayload = { roomCode, classType };
      socket.emit(CLIENT_EVENTS.setPlayerClass, payload);
    },
    startMatch(roomCode: string) {
      const payload: StartMatchPayload = { roomCode };
      socket.emit(CLIENT_EVENTS.startMatch, payload);
    },
    leaveRoom(roomCode: string) {
      const payload: LeaveRoomPayload = { roomCode };
      socket.emit(CLIENT_EVENTS.leaveRoom, payload);
    },
    sendInput(payload: InputPayload) {
      socket.emit(CLIENT_EVENTS.input, payload);
    }
  };

  window.__FPS_SOCKET__ = activeClientSocket;

  return activeClientSocket;
}

export function getClientSocket() {
  return activeClientSocket;
}
