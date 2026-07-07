import { describe, expect, it } from "vitest";
import { MATCH_TARGETS } from "../../src/shared/constants";
import { DEFAULT_MAP_ID } from "../../src/shared/map";
import type { RoomSnapshot } from "../../src/shared/types";
import { createAppViewModel, type ClientViewState } from "../../src/client/ui/appViewModel";

function createRoom(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code: "ABCDE",
    hostId: "host",
    phase: "lobby",
    matchTarget: MATCH_TARGETS[0],
    mapId: DEFAULT_MAP_ID,
    players: {
      host: {
        id: "host",
        nickname: "Host",
        color: "#f97316",
        x: 120,
        y: 120,
        aim: { x: 1, y: 0 },
        health: 4,
        kills: 0,
        alive: true,
        invulnerableUntil: 0,
        respawnAt: null,
        waitingForNextRound: false,
        ability: null,
        classType: "machine-gunner"
      },
      guest: {
        id: "guest",
        nickname: "Guest",
        color: "#22c55e",
        x: 320,
        y: 200,
        aim: { x: 1, y: 0 },
        health: 4,
        kills: 0,
        alive: true,
        invulnerableUntil: 0,
        respawnAt: null,
        waitingForNextRound: false,
        ability: null,
        classType: "machine-gunner"
      }
    } as any,
    activeProjectiles: {},
    activePickups: {},
    walls: [],
    winnerId: null,
    celebrationEndsAt: null,
    ...overrides
  };
}

function createState(overrides: Partial<ClientViewState> = {}): ClientViewState {
  return {
    room: null,
    roomList: [],
    roomListLoading: false,
    localPlayerId: null,
    nicknameDraft: "",
    roomCodeDraft: "",
    connectionReady: true,
    errorMessage: null,
    ...overrides
  };
}

describe("class system client view model", () => {
  it("shows lobby class options and allows multiple players to share the same class", () => {
    const room = createRoom({
      players: {
        host: {
          ...createRoom().players.host,
          classType: "laser-gunner"
        },
        guest: {
          ...createRoom().players.guest,
          classType: "laser-gunner"
        }
      } as any
    });
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect((model.roomLobby as any)?.localPlayerClassType).toBe("laser-gunner");
    expect((model.roomLobby as any)?.localPlayerClassLabel).toContain("Laser");
    expect((model.roomLobby as any)?.canChangeClass).toBe(true);
    expect((model.roomLobby as any)?.classOptions).toHaveLength(3);
    expect((model.roomLobby as any)?.classOptions.find((option: any) => option.id === "laser-gunner")?.selected).toBe(
      true
    );
    expect((model.roomLobby as any)?.players.every((player: any) => player.classLabel === "Laser Gunner")).toBe(true);
  });

  it("defaults legacy snapshots without class or special attack fields to machine gunner", () => {
    const room = createRoom() as any;
    delete room.players.host.classType;
    delete room.players.guest.classType;
    delete room.activeLasers;
    delete room.activeBombs;
    room.phase = "playing";

    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect((model.gameHud as any)?.localPlayerClassType).toBe("machine-gunner");
    expect((model.gameHud as any)?.localPlayerClassLabel).toContain("Machine");
    expect((model.gameHud as any)?.localPlayerStats).toContain("4 HP");
  });

  it("shows the chosen class alongside the active ability in the match HUD", () => {
    const room = createRoom({
      phase: "playing",
      players: {
        host: {
          ...createRoom().players.host,
          classType: "grenadier",
          ability: "heavy-shot"
        },
        guest: createRoom().players.guest
      } as any,
      activeBombs: {
        bomb: {
          id: "bomb",
          ownerId: "host",
          origin: { x: 120, y: 120 },
          target: { x: 320, y: 120 },
          blastRadius: 56,
          createdAt: 12_000,
          explodeAt: 12_500,
          state: "arming",
          explosionEndsAt: null,
          effect: "heavy-shot"
        }
      } as any
    } as any);
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect((model.gameHud as any)?.localPlayerClassType).toBe("grenadier");
    expect((model.gameHud as any)?.localPlayerClassLabel).toContain("Grenadier");
    expect((model.gameHud as any)?.activeAbilityType).toBe("heavy-shot");
    expect((model.gameHud as any)?.activeAbilityLabel).toContain("Heavy Shot");
  });
});
