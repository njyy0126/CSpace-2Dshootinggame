import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATCH_TARGETS } from "../../src/shared/constants";
import { DEFAULT_MAP_ID, MAPS } from "../../src/shared/map";
import type { RoomSnapshot } from "../../src/shared/types";
import {
  createAppViewModel,
  getVisibleScreen,
  type ClientViewState
} from "../../src/client/ui/appViewModel";

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
        ability: null
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
        ability: null
      }
    },
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

describe("app flow view model", () => {
  it("shows the landing screen before the player enters a room", () => {
    const screen = getVisibleScreen(createState());
    const model = createAppViewModel(createState());

    expect(screen).toBe("landing");
    expect(model.screen).toBe("landing");
    expect(model.showGameSurface).toBe(false);
    expect(model.hero.title).toContain("Crossfire");
    expect(model.roomLobby).toBeNull();
    expect(model.gameHud).toBeNull();
  });

  it("shows landing room summaries and only enables join for lobby rooms", () => {
    const model = createAppViewModel(
      createState({
        roomList: [
          {
            code: "ABCDE",
            hostNickname: "Host",
            playerCount: 2,
            phase: "lobby",
            mapId: DEFAULT_MAP_ID
          },
          {
            code: "FGHIJ",
            hostNickname: "Runner",
            playerCount: 4,
            phase: "playing",
            mapId: MAPS[1]!.id
          }
        ]
      })
    );

    expect(model.form.roomList).toHaveLength(2);
    expect(model.form.roomList[0]).toMatchObject({
      code: "ABCDE",
      hostNickname: "Host",
      canJoin: true
    });
    expect(model.form.roomList[1]).toMatchObject({
      code: "FGHIJ",
      hostNickname: "Runner",
      canJoin: false,
      phaseLabel: "Playing"
    });
  });

  it("shows the room lobby after creating or joining a room without showing the game surface", () => {
    const room = createRoom();
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.screen).toBe("room-lobby");
    expect(model.showGameSurface).toBe(false);
    expect(model.roomLobby?.roomCode).toBe(room.code);
    expect(model.roomLobby?.players).toHaveLength(2);
    expect(model.gameHud).toBeNull();
  });

  it("lets the host change the match target and start the game from the room lobby", () => {
    const room = createRoom({ matchTarget: 20 });
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.roomLobby?.canChangeTarget).toBe(true);
    expect(model.roomLobby?.canStartMatch).toBe(true);
    expect(model.roomLobby?.targetOptions.find((option) => option.value === 20)?.selected).toBe(true);
  });

  it("shows map options in the room lobby and lets the host change them before launch", () => {
    const room = createRoom({ mapId: MAPS[1]!.id });
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.roomLobby?.canChangeMap).toBe(true);
    expect(model.roomLobby?.mapOptions).toHaveLength(3);
    expect(model.roomLobby?.mapOptions.find((option) => option.id === MAPS[1]!.id)?.selected).toBe(true);
  });

  it("shows a leave-room action in the lobby model", () => {
    const room = createRoom();
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.roomLobby?.canLeaveRoom).toBe(true);
  });

  it("prevents non-host players from changing the match target or starting the game", () => {
    const room = createRoom();
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "guest"
      })
    );

    expect(model.roomLobby?.canChangeTarget).toBe(false);
    expect(model.roomLobby?.canStartMatch).toBe(false);
  });

  it("shows the in-game screen and game surface only after the room enters the playing phase", () => {
    const room = createRoom({ phase: "playing", mapId: MAPS[2]!.id });
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.screen).toBe("in-game");
    expect(model.showGameSurface).toBe(true);
    expect(model.roomLobby).toBeNull();
    expect(model.gameHud?.roomCode).toBe(room.code);
    expect(model.gameHud?.mapName).toBe(MAPS[2]!.name);
  });

  it("shows a leave-room action in the in-game HUD model", () => {
    const room = createRoom({ phase: "playing" });
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect(model.gameHud?.canLeaveRoom).toBe(true);
  });

  it("surfaces the server ability state and the live field drop in the in-game HUD", () => {
    const room = createRoom({
      phase: "playing",
      players: {
        host: {
          ...createRoom().players.host,
          ability: "ricochet"
        },
        guest: createRoom().players.guest
      } as any,
      activePickups: {
        red: {
          id: "red",
          type: "speed",
          x: 420,
          y: 300,
          radius: 12,
          spawnedAt: 12_000
        }
      }
    } as any);
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect((model.gameHud as any)?.activeAbilityType).toBe("ricochet");
    expect((model.gameHud as any)?.activeAbilityLabel).toContain("Ricochet");
    expect((model.gameHud as any)?.fieldPickupType).toBe("speed");
    expect((model.gameHud as any)?.fieldPickupLabel).toContain("Speed");
  });

  it("labels the purple rapid-fire ability and pickup distinctly in the HUD", () => {
    const room = createRoom({
      phase: "playing",
      players: {
        host: {
          ...createRoom().players.host,
          ability: "rapid-fire"
        },
        guest: createRoom().players.guest
      } as any,
      activePickups: {
        purple: {
          id: "purple",
          type: "rapid-fire",
          x: 500,
          y: 320,
          radius: 12,
          spawnedAt: 15_000
        }
      }
    } as any);
    const model = createAppViewModel(
      createState({
        room,
        localPlayerId: "host"
      })
    );

    expect((model.gameHud as any)?.activeAbilityType).toBe("rapid-fire");
    expect((model.gameHud as any)?.activeAbilityLabel).toContain("Rapid Fire");
    expect((model.gameHud as any)?.fieldPickupType).toBe("rapid-fire");
    expect((model.gameHud as any)?.fieldPickupLabel).toContain("Rapid Fire");
  });
});

describe("app structure regression guards", () => {
  it("does not poll the UI with a render interval", () => {
    const source = readFileSync("src/client/app.ts", "utf8");

    expect(source).not.toContain("setInterval(render");
    expect(source).not.toContain("window.setInterval(render");
  });

  it("mounts the Phaser game only behind the in-game screen gate", () => {
    const source = readFileSync("src/client/app.ts", "utf8");

    expect(source).toContain("if (model.showGameSurface)");
    expect(source).toContain("game = createGame(currentGameRoot);");
  });

  it("marks the shell with the active screen so CSS can switch to the map-first match layout", () => {
    const source = readFileSync("src/client/app.ts", "utf8");

    expect(source).toContain("appShell.dataset.screen = model.screen");
  });

  it("loads the Phaser runtime on demand instead of bundling it into the landing flow", () => {
    const source = readFileSync("src/client/app.ts", "utf8");

    expect(source).toContain('import("./game/createGame")');
    expect(source).not.toContain('import { createGame');
  });

  it("keeps the debug bridge exposing a short-lived input override for automation", () => {
    const source = readFileSync("src/client/main.ts", "utf8");

    expect(source).toContain("DEBUG_INPUT_OVERRIDE_MS = 120");
    expect(source).toContain("getInputOverride()");
  });
});
