import { describe, expect, it } from "vitest";
import {
  ARENA_MAP,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PROJECTILE_FIRE_INTERVAL_MS,
  RESPAWN_DELAY_MS
} from "../../src/shared/constants";
import { createEngine } from "../../src/server/game/engine";
import {
  createDefaultInputState,
  createPlayer,
  createRoomState
} from "../../src/server/game/state";
import { createRoomStore } from "../../src/server/rooms/roomStore";

const LASER_RADIUS = PLAYER_RADIUS / 4;
const GRENADE_BLAST_RADIUS = PLAYER_RADIUS * 2;
const LASER_FIRE_INTERVAL_MS = PROJECTILE_FIRE_INTERVAL_MS * 4;
const GRENADE_FIRE_INTERVAL_MS = PROJECTILE_FIRE_INTERVAL_MS * 3;

function createBoundaryWalls() {
  return [
    {
      id: "b-top",
      kind: "boundary",
      destructible: false,
      x: 0,
      y: 0,
      width: ARENA_MAP.width,
      height: 24
    },
    {
      id: "b-bottom",
      kind: "boundary",
      destructible: false,
      x: 0,
      y: ARENA_MAP.height - 24,
      width: ARENA_MAP.width,
      height: 24
    },
    {
      id: "b-left",
      kind: "boundary",
      destructible: false,
      x: 0,
      y: 0,
      width: 24,
      height: ARENA_MAP.height
    },
    {
      id: "b-right",
      kind: "boundary",
      destructible: false,
      x: ARENA_MAP.width - 24,
      y: 0,
      width: 24,
      height: ARENA_MAP.height
    }
  ];
}

function createCombatRoom(extraWalls: any[] = []) {
  const room = createRoomState("ABCDE", "host", "Host") as any;

  room.phase = "playing";
  room.lastTickAt = 0;
  room.walls = [...createBoundaryWalls(), ...extraWalls];
  room.activeProjectiles = {};
  room.activePickups = {};
  room.activeLasers = {};
  room.activeBombs = {};

  room.players.host.x = 120;
  room.players.host.y = 120;
  room.playerInputs.host = {
    ...room.playerInputs.host,
    moveX: 0,
    moveY: 0,
    aimX: 320,
    aimY: 120,
    firing: false,
    fireQueued: false,
    lastUpdatedAt: 0,
    lastFiredAt: 0
  };

  room.players.target = {
    ...createPlayer("target", "Target", "#fca5a5"),
    x: 300,
    y: 120
  };
  room.playerInputs.target = createDefaultInputState(room.players.target);

  return room;
}

describe("class system server flow", () => {
  it("lets players pick classes in the lobby, allows duplicates, and defaults old players to machine gunner", () => {
    const store = createRoomStore() as any;
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    expect(room.players.host.classType ?? "machine-gunner").toBe("machine-gunner");
    expect(room.players.guest.classType ?? "machine-gunner").toBe("machine-gunner");

    const hostUpdated = store.updatePlayerClass(room.code, "host", "laser-gunner");
    const guestUpdated = store.updatePlayerClass(room.code, "guest", "laser-gunner");

    expect(hostUpdated?.players.host.classType).toBe("laser-gunner");
    expect(guestUpdated?.players.guest.classType).toBe("laser-gunner");

    store.startMatch(room);

    expect(store.updatePlayerClass(room.code, "host", "grenadier")).toBeNull();
    expect(room.players.host.classType).toBe("laser-gunner");
    expect(room.players.guest.classType).toBe("laser-gunner");
  });

  it("spawns a locked laser that stops at the next wall, damages once after 0.1 seconds, and expires after 0.4 seconds", () => {
    const room = createCombatRoom([
      {
        id: "laser-stop",
        kind: "cover",
        destructible: true,
        x: 220,
        y: 60,
        width: 20,
        height: 120
      }
    ]);
    room.players.host.classType = "laser-gunner";
    room.players.target.x = 200;
    room.players.target.y = 120;
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    room.lastTickAt = 950;
    engine.tickRoom(room, 1_000);

    expect(Object.values(room.activeProjectiles)).toHaveLength(0);
    expect(Object.values(room.activeLasers ?? {})).toHaveLength(1);

    const laser = Object.values(room.activeLasers ?? {})[0] as any;
    expect(laser.path).toHaveLength(2);
    expect(laser.path[1].x).toBeCloseTo(220 - LASER_RADIUS, 4);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH);

    engine.tickRoom(room, 1_099);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH);

    engine.tickRoom(room, 1_100);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH - 1);

    engine.tickRoom(room, 1_180);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH - 1);
    expect(Object.values(room.activeLasers ?? {})).toHaveLength(1);

    engine.tickRoom(room, 1_401);
    expect(Object.values(room.activeLasers ?? {})).toHaveLength(0);
  });

  it("lets green lasers bounce once, stop on the next wall, and never take a second bounce", () => {
    const room = createCombatRoom([
      {
        id: "bounce-first",
        kind: "cover",
        destructible: true,
        x: 220,
        y: 60,
        width: 20,
        height: 120
      },
      {
        id: "bounce-second",
        kind: "cover",
        destructible: true,
        x: 60,
        y: 60,
        width: 20,
        height: 120
      }
    ]);
    room.players.host.classType = "laser-gunner";
    room.players.host.ability = "ricochet";
    room.players.target.x = 100;
    room.players.target.y = 120;
    room.players.deep = {
      ...createPlayer("deep", "Deep", "#86efac"),
      x: 40,
      y: 120
    };
    room.playerInputs.deep = createDefaultInputState(room.players.deep);
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    room.lastTickAt = 1_950;
    engine.tickRoom(room, 2_000);

    const laser = Object.values(room.activeLasers ?? {})[0] as any;
    expect(laser.path).toHaveLength(3);
    expect(laser.path[2].x).toBeCloseTo(80 + LASER_RADIUS, 4);

    engine.tickRoom(room, 2_100);

    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH - 1);
    expect(room.players.deep.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("doubles blue laser width and its hit test area", () => {
    const normalRoom = createCombatRoom();
    normalRoom.players.host.classType = "laser-gunner";
    normalRoom.players.target.x = 220;
    normalRoom.players.target.y = 120 + PLAYER_RADIUS + LASER_RADIUS + 1;
    normalRoom.playerInputs.host = {
      ...normalRoom.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const boostedRoom = createCombatRoom();
    boostedRoom.players.host.classType = "laser-gunner";
    boostedRoom.players.host.ability = "heavy-shot";
    boostedRoom.players.target.x = 220;
    boostedRoom.players.target.y = 120 + PLAYER_RADIUS + LASER_RADIUS + 1;
    boostedRoom.playerInputs.host = {
      ...boostedRoom.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    normalRoom.lastTickAt = 2_950;
    engine.tickRoom(normalRoom, 3_000);
    engine.tickRoom(normalRoom, 3_100);

    boostedRoom.lastTickAt = 3_950;
    engine.tickRoom(boostedRoom, 4_000);
    const heavyLaser = Object.values(boostedRoom.activeLasers ?? {})[0] as any;
    engine.tickRoom(boostedRoom, 4_100);

    expect(normalRoom.players.target.health).toBe(PLAYER_MAX_HEALTH);
    expect(boostedRoom.players.target.health).toBe(PLAYER_MAX_HEALTH - 1);
    expect(heavyLaser.radius).toBe(LASER_RADIUS * 2);
  });

  it("halves laser fire interval with purple ability", () => {
    const baseRoom = createCombatRoom();
    baseRoom.players.host.classType = "laser-gunner";
    baseRoom.playerInputs.host = {
      ...baseRoom.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const boostedRoom = createCombatRoom();
    boostedRoom.players.host.classType = "laser-gunner";
    boostedRoom.players.host.ability = "rapid-fire";
    boostedRoom.playerInputs.host = {
      ...boostedRoom.playerInputs.host,
      aimX: 420,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    baseRoom.lastTickAt = 4_950;
    engine.tickRoom(baseRoom, 5_000);
    engine.tickRoom(baseRoom, 5_000 + LASER_FIRE_INTERVAL_MS / 2);

    boostedRoom.lastTickAt = 5_950;
    engine.tickRoom(boostedRoom, 6_000);
    engine.tickRoom(boostedRoom, 6_000 + LASER_FIRE_INTERVAL_MS / 2);

    expect(Object.values(baseRoom.activeLasers ?? {})).toHaveLength(1);
    expect(Object.values(boostedRoom.activeLasers ?? {})).toHaveLength(2);
  });

  it("keeps grenades inside the default throw range, but green ability unlocks any legal point on the map", () => {
    const room = createCombatRoom([
      {
        id: "blocked-throw",
        kind: "cover",
        destructible: true,
        x: 680,
        y: 120,
        width: 80,
        height: 80
      }
    ]);
    room.players.host.classType = "grenadier";
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: 720,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    room.lastTickAt = 6_950;
    engine.tickRoom(room, 7_000);
    expect(Object.values(room.activeBombs ?? {})).toHaveLength(0);

    room.players.host.ability = "ricochet";
    room.playerInputs.host = {
      ...room.playerInputs.host,
      firing: true,
      fireQueued: true,
      aimX: 600,
      aimY: 120,
      lastFiredAt: 0
    };

    room.lastTickAt = 7_450;
    engine.tickRoom(room, 7_500);

    expect(Object.values(room.activeBombs ?? {})).toHaveLength(1);

    room.activeBombs = {};
    room.playerInputs.host = {
      ...room.playerInputs.host,
      firing: true,
      fireQueued: true,
      aimX: 720,
      aimY: 120,
      lastFiredAt: 0
    };
    room.lastTickAt = 7_950;
    engine.tickRoom(room, 8_000);

    expect(Object.values(room.activeBombs ?? {})).toHaveLength(0);
  });

  it("locks grenade landing on throw, explodes after 0.5 seconds, and only hits players still in range at that moment", () => {
    const room = createCombatRoom();
    room.players.host.classType = "grenadier";
    room.players.target.x = 300;
    room.players.target.y = 120;
    room.players.runner = {
      ...createPlayer("runner", "Runner", "#86efac"),
      x: 420,
      y: 120
    };
    room.playerInputs.runner = createDefaultInputState(room.players.runner);
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: 300,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    room.lastTickAt = 8_950;
    engine.tickRoom(room, 9_000);

    const bomb = Object.values(room.activeBombs ?? {})[0] as any;
    expect(bomb.target).toEqual({ x: 300, y: 120 });

    room.playerInputs.host = {
      ...room.playerInputs.host,
      firing: false,
      fireQueued: false
    };
    room.players.host.x = 220;
    room.players.host.y = 240;
    room.players.target.x = 420;
    room.players.runner.x = 300;
    room.lastTickAt = 9_000;

    engine.tickRoom(room, 9_499);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH);
    expect(room.players.runner.health).toBe(PLAYER_MAX_HEALTH);

    engine.tickRoom(room, 9_500);
    expect(room.players.target.health).toBe(PLAYER_MAX_HEALTH);
    expect(room.players.runner.health).toBe(PLAYER_MAX_HEALTH - 1);

    const explodingBomb = Object.values(room.activeBombs ?? {})[0] as any;
    expect(explodingBomb.state).toBe("exploding");

    engine.tickRoom(room, 10_000);
    expect(Object.values(room.activeBombs ?? {})).toHaveLength(0);
  });

  it("doubles blue grenade blast radius and its damage area", () => {
    const baseRoom = createCombatRoom();
    baseRoom.players.host.classType = "grenadier";
    baseRoom.players.target.x = 350;
    baseRoom.players.target.y = 120;
    baseRoom.playerInputs.host = {
      ...baseRoom.playerInputs.host,
      aimX: 300,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const boostedRoom = createCombatRoom();
    boostedRoom.players.host.classType = "grenadier";
    boostedRoom.players.host.ability = "heavy-shot";
    boostedRoom.players.target.x = 350;
    boostedRoom.players.target.y = 120;
    boostedRoom.playerInputs.host = {
      ...boostedRoom.playerInputs.host,
      aimX: 300,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    baseRoom.lastTickAt = 10_950;
    engine.tickRoom(baseRoom, 11_000);
    engine.tickRoom(baseRoom, 11_500);

    boostedRoom.lastTickAt = 11_950;
    engine.tickRoom(boostedRoom, 12_000);
    const boostedBomb = Object.values(boostedRoom.activeBombs ?? {})[0] as any;
    engine.tickRoom(boostedRoom, 12_500);

    expect(baseRoom.players.target.health).toBe(PLAYER_MAX_HEALTH);
    expect(boostedRoom.players.target.health).toBe(PLAYER_MAX_HEALTH - 1);
    expect(boostedBomb.blastRadius).toBe(GRENADE_BLAST_RADIUS * 2);
  });

  it("halves grenade fire interval with purple ability", () => {
    const baseRoom = createCombatRoom();
    baseRoom.players.host.classType = "grenadier";
    baseRoom.playerInputs.host = {
      ...baseRoom.playerInputs.host,
      aimX: 300,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const boostedRoom = createCombatRoom();
    boostedRoom.players.host.classType = "grenadier";
    boostedRoom.players.host.ability = "rapid-fire";
    boostedRoom.playerInputs.host = {
      ...boostedRoom.playerInputs.host,
      aimX: 300,
      aimY: 120,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine() as any;

    baseRoom.lastTickAt = 12_950;
    engine.tickRoom(baseRoom, 13_000);
    engine.tickRoom(baseRoom, 13_000 + GRENADE_FIRE_INTERVAL_MS / 2);

    boostedRoom.lastTickAt = 13_950;
    engine.tickRoom(boostedRoom, 14_000);
    engine.tickRoom(boostedRoom, 14_000 + GRENADE_FIRE_INTERVAL_MS / 2);

    expect(Object.values(baseRoom.activeBombs ?? {})).toHaveLength(1);
    expect(Object.values(boostedRoom.activeBombs ?? {})).toHaveLength(2);
  });

  it("clears temporary ability-powered attacks on death but keeps the chosen class through respawn", () => {
    const room = createCombatRoom();
    room.players.host.classType = "laser-gunner";
    room.players.host.ability = "heavy-shot";
    room.activeProjectiles.heavy = {
      id: "heavy",
      ownerId: "host",
      x: 180,
      y: 120,
      vx: 10,
      vy: 0,
      radius: 8,
      celebrationOnly: false,
      effect: "heavy-shot",
      ricochetsRemaining: 0
    };
    room.activeLasers.heavy = {
      id: "laser",
      ownerId: "host",
      path: [
        { x: 140, y: 120 },
        { x: 240, y: 120 }
      ],
      radius: LASER_RADIUS * 2,
      createdAt: 14_000,
      activatesAt: 14_100,
      expiresAt: 14_400,
      effect: "heavy-shot",
      damageApplied: false
    };
    room.activeBombs.heavy = {
      id: "bomb",
      ownerId: "host",
      origin: { x: 120, y: 120 },
      target: { x: 300, y: 120 },
      blastRadius: GRENADE_BLAST_RADIUS * 2,
      createdAt: 14_000,
      explodeAt: 14_500,
      state: "arming",
      explosionEndsAt: null,
      effect: "heavy-shot"
    };

    const engine = createEngine() as any;
    const deathTime = 15_000;

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "target", "host", deathTime);
    }

    expect(room.players.host.alive).toBe(false);
    expect(room.players.host.ability).toBeNull();
    expect(room.players.host.classType).toBe("laser-gunner");
    expect(room.activeProjectiles.heavy).toBeUndefined();
    expect(room.activeLasers.heavy).toBeUndefined();
    expect(room.activeBombs.heavy).toBeUndefined();

    engine.respawnDuePlayers(room, deathTime + RESPAWN_DELAY_MS);

    expect(room.players.host.alive).toBe(true);
    expect(room.players.host.ability).toBeNull();
    expect(room.players.host.classType).toBe("laser-gunner");
  });

  it("clears lasers, bombs, projectiles, and temporary abilities when a room falls back to the lobby and starts again", () => {
    const store = createRoomStore() as any;
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    store.updatePlayerClass(room.code, "host", "grenadier");
    store.startMatch(room);

    room.players.host.ability = "ricochet";
    room.activeProjectiles.demo = {
      id: "demo-projectile",
      ownerId: "host",
      x: 160,
      y: 120,
      vx: 10,
      vy: 0,
      radius: 4,
      celebrationOnly: false,
      effect: "ricochet",
      ricochetsRemaining: 1
    };
    room.activeLasers = {
      demo: {
        id: "demo-laser",
        ownerId: "host",
        path: [
          { x: 140, y: 120 },
          { x: 280, y: 120 }
        ],
        radius: LASER_RADIUS,
        createdAt: 15_000,
        activatesAt: 15_100,
        expiresAt: 15_400,
        effect: "ricochet",
        damageApplied: false
      }
    };
    room.activeBombs = {
      demo: {
        id: "demo-bomb",
        ownerId: "host",
        origin: { x: 120, y: 120 },
        target: { x: 280, y: 120 },
        blastRadius: GRENADE_BLAST_RADIUS,
        createdAt: 15_000,
        explodeAt: 15_500,
        state: "arming",
        explosionEndsAt: null,
        effect: "ricochet"
      }
    };

    const lobbyRoom = store.leaveRoom(room.code, "guest");

    expect(lobbyRoom?.phase).toBe("lobby");
    expect(lobbyRoom?.players.host.classType).toBe("grenadier");
    expect(lobbyRoom?.players.host.ability).toBeNull();
    expect(lobbyRoom?.activeProjectiles).toEqual({});
    expect((lobbyRoom as any)?.activeLasers).toEqual({});
    expect((lobbyRoom as any)?.activeBombs).toEqual({});

    store.joinRoom(room.code, "guest-2", "Guest 2");
    store.startMatch(room);

    expect(room.phase).toBe("playing");
    expect(room.players.host.classType).toBe("grenadier");
    expect(room.players.host.ability).toBeNull();
    expect(room.activeProjectiles).toEqual({});
    expect((room as any).activeLasers).toEqual({});
    expect((room as any).activeBombs).toEqual({});
  });
});
