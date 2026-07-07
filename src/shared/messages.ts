import type { ClientInput, MapId, MatchTarget, PlayerClass, RoomSnapshot, RoomSummary } from "./types";

export const CLIENT_EVENTS = {
  createRoom: "client:create-room",
  joinRoom: "client:join-room",
  requestRoomList: "client:request-room-list",
  setMatchTarget: "client:set-match-target",
  setMap: "client:set-map",
  setPlayerClass: "client:set-player-class",
  startMatch: "client:start-match",
  leaveRoom: "client:leave-room",
  input: "client:input"
} as const;

export const SERVER_EVENTS = {
  roomState: "server:room-state",
  roomList: "server:room-list",
  roomError: "server:room-error",
  joinedRoom: "server:joined-room"
} as const;

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  nickname: string;
}

export interface SetMatchTargetPayload {
  roomCode: string;
  target: MatchTarget;
}

export interface SetMapPayload {
  roomCode: string;
  mapId: MapId;
}

export interface SetPlayerClassPayload {
  roomCode: string;
  classType: PlayerClass;
}

export interface StartMatchPayload {
  roomCode: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
}

export interface ServerRoomListPayload {
  rooms: RoomSummary[];
}

export type InputPayload = ClientInput;

export interface RoomErrorPayload {
  message: string;
}

export interface JoinedRoomPayload {
  roomCode: string;
  playerId: string;
}

export interface ServerRoomStatePayload {
  room: RoomSnapshot;
}
