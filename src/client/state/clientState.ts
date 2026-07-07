import type { RoomSnapshot, RoomSummary } from "../../shared/types";
import type { ClientViewState } from "../ui/appViewModel";

export interface ClientState {
  room: RoomSnapshot | null;
  roomList: RoomSummary[];
  roomListLoading: boolean;
  localPlayerId: string | null;
  nicknameDraft: string;
  roomCodeDraft: string;
  connectionReady: boolean;
  errorMessage: string | null;
}

const state: ClientState = {
  room: null,
  roomList: [],
  roomListLoading: false,
  localPlayerId: null,
  nicknameDraft: "",
  roomCodeDraft: "",
  connectionReady: false,
  errorMessage: null
};

const listeners = new Set<(state: ClientState) => void>();

export function updateRoom(room: RoomSnapshot | null) {
  state.room = room;
  notify();
}

export function clearRoomState() {
  state.room = null;
  state.errorMessage = null;
  notify();
}

export function updateRoomList(roomList: RoomSummary[]) {
  state.roomList = roomList;
  notify();
}

export function setRoomListLoading(roomListLoading: boolean) {
  state.roomListLoading = roomListLoading;
  notify();
}

export function updateLocalPlayerId(playerId: string | null) {
  state.localPlayerId = playerId;
  state.connectionReady = Boolean(playerId);
  notify();
}

export function updateNicknameDraft(nickname: string) {
  state.nicknameDraft = nickname;
  notify();
}

export function updateRoomCodeDraft(roomCode: string) {
  state.roomCodeDraft = roomCode.toUpperCase();
  notify();
}

export function updateErrorMessage(message: string | null) {
  state.errorMessage = message;
  notify();
}

export function subscribeToClientState(listener: (state: ClientState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getClientState() {
  return state;
}

export function getClientViewState(): ClientViewState {
  return {
    room: state.room,
    roomList: state.roomList,
    roomListLoading: state.roomListLoading,
    localPlayerId: state.localPlayerId,
    nicknameDraft: state.nicknameDraft,
    roomCodeDraft: state.roomCodeDraft,
    connectionReady: state.connectionReady,
    errorMessage: state.errorMessage
  };
}

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}
