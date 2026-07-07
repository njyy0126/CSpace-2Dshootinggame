import "./styles.css";
import { mountApp } from "./app";
import { getClientSocket } from "./net/clientSocket";
import { getClientState } from "./state/clientState";

declare global {
  interface Window {
    __FPS_DEBUG__?: {
      getClientState: typeof getClientState;
      sendInput: (input: {
        moveX: number;
        moveY: number;
        aimX: number;
        aimY: number;
        firing: boolean;
      }) => boolean;
      getInputOverride: () => {
        moveX: number;
        moveY: number;
        aimX: number;
        aimY: number;
        firing: boolean;
        until: number;
      } | null;
    };
  }
}

const DEBUG_INPUT_OVERRIDE_MS = 120;
let debugInputOverride: {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
  until: number;
} | null = null;

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

window.__FPS_DEBUG__ = {
  getClientState,
  sendInput(input) {
    const socket = window.__FPS_SOCKET__ ?? getClientSocket();
    const room = getClientState().room;
    if (!socket || !room) {
      return false;
    }

    debugInputOverride = {
      ...input,
      until: Date.now() + DEBUG_INPUT_OVERRIDE_MS
    };

    socket.sendInput({
      roomCode: room.code,
      ...input
    });

    return true;
  },
  getInputOverride() {
    if (!debugInputOverride) {
      return null;
    }

    if (debugInputOverride.until <= Date.now()) {
      debugInputOverride = null;
      return null;
    }

    return debugInputOverride;
  }
};

mountApp(root);
