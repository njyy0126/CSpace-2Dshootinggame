import { describe, expect, it } from "vitest";
import {
  ARENA_MAP,
  CELEBRATION_DURATION_MS,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PROJECTILE_FIRE_INTERVAL_MS,
  PLAYER_MOVE_SPEED,
  PROJECTILE_SPEED,
  PROJECTILE_RADIUS,
  RESPAWN_DELAY_MS,
  RESPAWN_INVULNERABLE_MS,
  SERVER_TICK_MS
} from "../../src/shared/constants";
import { MAPS, WALLS } from "../../src/shared/map";
import { projectileHitsPlayer } from "../../src/server/game/collision";
import { createEngine } from "../../src/server/game/engine";
import { createPlayer, createRoomState } from "../../src/server/game/state";
import { createRoomStore } from "../../src/server/rooms/roomStore";

describe("game engine", () => {
  it("kills a player after four projectile hits", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.players.enemy = {
      ...createPlayer("enemy", "Enemy", "#fca5a5"),
      x: 200,
      y: 100
    };

    const engine = createEngine();
    const now = 10_000;

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "host", "enemy", now);
    }

    expect(room.players.enemy.alive).toBe(false);
    expect(room.players.enemy.health).toBe(0);
    expect(room.players.enemy.respawnAt).toBe(now + RESPAWN_DELAY_MS);
    expect(room.players.host.kills).toBe(1);
  });

  it("enters celebration when the kill target is reached", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.matchTarget = 1;
    room.players.enemy = {
      ...createPlayer("enemy", "Enemy", "#fca5a5"),
      x: 200,
      y: 100
    };

    const engine = createEngine();
    const now = 20_000;

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "host", "enemy", now);
    }

    expect(room.phase).toBe("celebration");
    expect(room.winnerId).toBe("host");
    expect(room.celebrationEndsAt).toBe(now + CELEBRATION_DURATION_MS);
  });

  it("respawns due players with full health and invulnerability", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.players.enemy = {
      ...createPlayer("enemy", "Enemy", "#fca5a5"),
      x: 200,
      y: 100
    };
    (room.players.enemy as any).ability = "heavy-shot";

    const engine = createEngine();
    const hitTime = 30_000;
    const respawnTime = hitTime + RESPAWN_DELAY_MS;

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "host", "enemy", hitTime);
    }

    engine.respawnDuePlayers(room, respawnTime);

    expect(room.players.enemy.alive).toBe(true);
    expect(room.players.enemy.health).toBe(PLAYER_MAX_HEALTH);
    expect(room.players.enemy.respawnAt).toBeNull();
    expect(room.players.enemy.invulnerableUntil).toBe(respawnTime + RESPAWN_INVULNERABLE_MS);
    expect((room.players.enemy as any).ability).toBeNull();
  });

  it("returns celebration rooms to the lobby when the timer expires", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "celebration";
    room.winnerId = "host";
    room.celebrationEndsAt = 40_000;

    const engine = createEngine();
    engine.resetAfterCelebration(room, 40_000);

    expect(room.phase).toBe("lobby");
    expect(room.winnerId).toBeNull();
    expect(room.celebrationEndsAt).toBeNull();
  });

  it("moves active players from their latest input during the match", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 50_000 - SERVER_TICK_MS;
    room.playerInputs.host = {
      moveX: 1,
      moveY: 0,
      aimX: room.players.host.x + 100,
      aimY: room.players.host.y,
      firing: false,
      lastUpdatedAt: 50_000,
      lastFiredAt: 0
    };

    const engine = createEngine();
    const startX = room.players.host.x;
    engine.tickRoom(room, 50_000);

    expect(room.players.host.x).toBeCloseTo(
      startX + PLAYER_MOVE_SPEED * (SERVER_TICK_MS / 1_000),
      5
    );
  });

  it("stops players before cover walls during movement", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    const wall = WALLS.find((candidate) => candidate.kind === "cover")!;
    room.phase = "playing";
    room.lastTickAt = 55_000 - 100;
    room.players.host.x = wall.x - PLAYER_RADIUS - 1;
    room.players.host.y = wall.y + wall.height / 2;
    room.playerInputs.host = {
      moveX: 1,
      moveY: 0,
      aimX: wall.x + wall.width,
      aimY: wall.y + wall.height / 2,
      firing: false,
      lastUpdatedAt: 55_000,
      lastFiredAt: 0
    };

    const engine = createEngine();
    engine.tickRoom(room, 55_000);

    expect(room.players.host.x).toBeLessThanOrEqual(wall.x - PLAYER_RADIUS);
  });

  it("creates projectiles for firing players during the match", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 60_000 - SERVER_TICK_MS;
    room.playerInputs.host = {
      moveX: 0,
      moveY: 0,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      lastUpdatedAt: 60_000,
      lastFiredAt: 0
    };

    const engine = createEngine();
    engine.tickRoom(room, 60_000);

    const projectiles = Object.values(room.activeProjectiles);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0]?.vx).toBe(PROJECTILE_SPEED);
  });

  it("lets ricochet projectiles bounce once and removes them on the next wall", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.activeProjectiles.bounce = {
      id: "bounce",
      ownerId: "host",
      x: 40,
      y: 120,
      vx: -PROJECTILE_SPEED,
      vy: 0,
      radius: PROJECTILE_RADIUS,
      celebrationOnly: false,
      effect: "ricochet",
      ricochetsRemaining: 1
    } as any;

    const engine = createEngine();

    engine.advanceProjectiles(room, SERVER_TICK_MS / 1_000, 72_000, false);

    const bounced = room.activeProjectiles.bounce as any;
    expect(bounced).toBeDefined();
    expect(bounced.vx).toBe(PROJECTILE_SPEED);
    expect(bounced.ricochetsRemaining).toBe(0);

    bounced.x = ARENA_MAP.width - 40;
    bounced.y = 120;
    bounced.vx = PROJECTILE_SPEED;

    engine.advanceProjectiles(room, SERVER_TICK_MS / 1_000, 72_050, false);

    expect(room.activeProjectiles.bounce).toBeUndefined();
  });

  it("doubles heavy-shot projectile collision radius and keeps the modifier on the snapshot", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 74_000 - SERVER_TICK_MS;
    (room.players.host as any).ability = "heavy-shot";
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine();
    engine.tickRoom(room, 74_000);

    const projectile = Object.values(room.activeProjectiles)[0] as any;
    const edgeTarget = {
      ...createPlayer("edge", "Edge", "#86efac"),
      x: projectile.x + PLAYER_RADIUS + PROJECTILE_RADIUS + 2,
      y: projectile.y
    };

    expect(projectile.radius).toBe(PROJECTILE_RADIUS * 2);
    expect(projectile.effect).toBe("heavy-shot");
    expect(projectileHitsPlayer({ ...projectile, radius: PROJECTILE_RADIUS } as any, edgeTarget)).toBe(false);
    expect(projectileHitsPlayer(projectile, edgeTarget)).toBe(true);
  });

  it("makes speed-boosted players move faster without changing projectile speed", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 76_000 - SERVER_TICK_MS;
    (room.players.host as any).ability = "speed";
    room.playerInputs.host = {
      ...room.playerInputs.host,
      moveX: 1,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine();
    const startX = room.players.host.x;

    engine.tickRoom(room, 76_000);

    const projectile = Object.values(room.activeProjectiles)[0];
    expect(room.players.host.x - startX).toBeGreaterThan(PLAYER_MOVE_SPEED * (SERVER_TICK_MS / 1_000));
    expect(projectile?.vx).toBe(PROJECTILE_SPEED);
  });

  it("lets rapid-fire players shoot twice inside the normal cooldown without changing projectile size or speed", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    (room.players.host as any).ability = "rapid-fire";
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine();

    engine.spawnProjectiles(room, 78_000);
    engine.spawnProjectiles(room, 78_000 + PROJECTILE_FIRE_INTERVAL_MS / 2);

    const projectiles = Object.values(room.activeProjectiles);
    expect(projectiles).toHaveLength(2);
    expect(projectiles.every((projectile) => projectile.radius === PROJECTILE_RADIUS)).toBe(true);
    expect(projectiles.every((projectile) => projectile.vx === PROJECTILE_SPEED)).toBe(true);
    expect(projectiles.every((projectile) => projectile.effect === null)).toBe(true);
  });

  it("creates a projectile from a queued shot even if firing is already released", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 62_000 - SERVER_TICK_MS;
    room.playerInputs.host = {
      moveX: 0,
      moveY: 0,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: false,
      fireQueued: true,
      lastUpdatedAt: 62_000,
      lastFiredAt: 0
    } as typeof room.playerInputs.host;

    const engine = createEngine();
    engine.tickRoom(room, 62_000);

    expect(Object.values(room.activeProjectiles)).toHaveLength(1);
    expect(room.playerInputs.host.fireQueued).toBe(false);
  });

  it("does not let point-blank shots pass through cover walls", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    const wall = WALLS.find((candidate) => candidate.kind === "cover")!;
    room.phase = "playing";
    room.lastTickAt = 65_000 - SERVER_TICK_MS;
    room.players.host.x = wall.x + wall.width / 2;
    room.players.host.y = wall.y + wall.height + PLAYER_RADIUS;
    room.players.host.aim = { x: 0, y: -1 };
    room.playerInputs.host = {
      moveX: 0,
      moveY: 0,
      aimX: room.players.host.x,
      aimY: wall.y - 100,
      firing: true,
      lastUpdatedAt: 65_000,
      lastFiredAt: 0
    };

    const engine = createEngine();
    engine.tickRoom(room, 65_000);

    expect(Object.values(room.activeProjectiles)).toHaveLength(0);
  });

  it("lets celebration projectiles destroy destructible walls only", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    const destructibleWall = WALLS.find((wall) => wall.kind === "cover")!;
    const boundaryWall = WALLS.find((wall) => wall.kind === "boundary")!;
    room.phase = "celebration";
    room.winnerId = "host";
    room.lastTickAt = 70_000 - SERVER_TICK_MS;
    room.activeProjectiles.test = {
      id: "test",
      ownerId: "host",
      x: destructibleWall.x + destructibleWall.width / 2,
      y: destructibleWall.y + destructibleWall.height / 2,
      vx: 0,
      vy: 0,
      radius: 26,
      celebrationOnly: true,
      effect: null,
      ricochetsRemaining: 0
    };

    const engine = createEngine();
    engine.tickCelebration(room, 70_000);

    expect(room.walls.some((wall) => wall.id === destructibleWall.id)).toBe(false);
    expect(room.walls.some((wall) => wall.id === boundaryWall.id)).toBe(true);
  });

  it("restores the lobby map and player state after celebration", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.players.guest = {
      ...createPlayer("guest", "Guest", "#86efac"),
      alive: false,
      health: 0,
      kills: 2,
      waitingForNextRound: true,
      respawnAt: 80_100
    };
    (room.players.host as any).ability = "speed";
    (room.players.guest as any).ability = "ricochet";
    room.playerInputs.guest = {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      firing: false,
      lastUpdatedAt: 0,
      lastFiredAt: 0
    };
    room.phase = "celebration";
    room.winnerId = "host";
    room.celebrationEndsAt = 80_000;
    (room as any).activePickups = {
      blue: {
        id: "blue",
        type: "heavy-shot",
        x: 420,
        y: 300,
        radius: 12,
        spawnedAt: 79_000
      }
    };
    room.walls = room.walls.filter((wall) => wall.id !== "c-mid-a");

    const engine = createEngine();
    engine.resetAfterCelebration(room, 80_000);

    expect(room.phase).toBe("lobby");
    expect(room.winnerId).toBeNull();
    expect(room.celebrationEndsAt).toBeNull();
    expect(room.players.guest.alive).toBe(true);
    expect(room.players.guest.health).toBe(PLAYER_MAX_HEALTH);
    expect(room.players.guest.kills).toBe(0);
    expect(room.players.guest.waitingForNextRound).toBe(false);
    expect((room.players.host as any).ability).toBeNull();
    expect((room.players.guest as any).ability).toBeNull();
    expect((room as any).activePickups).toEqual({});
    expect(room.walls).toHaveLength(WALLS.length);
  });

  it("clears stale firing input before a new match starts", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    store.startMatch(room);
    room.lastTickAt = 90_000 - SERVER_TICK_MS;

    const engine = createEngine();
    engine.tickRoom(room, 90_000);

    expect(room.playerInputs.host.firing).toBe(false);
    expect(room.playerInputs.host.fireQueued).toBe(false);
    expect(Object.values(room.activeProjectiles)).toHaveLength(0);
  });

  it("does not carry celebration firing input into the next match after returning to the lobby", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    room.phase = "celebration";
    room.winnerId = "host";
    room.celebrationEndsAt = 100_000;
    room.playerInputs.host = {
      ...room.playerInputs.host,
      aimX: room.players.host.x + 200,
      aimY: room.players.host.y,
      firing: true,
      fireQueued: true,
      lastFiredAt: 0
    };

    const engine = createEngine();
    engine.resetAfterCelebration(room, 100_000);
    store.startMatch(room);
    room.lastTickAt = 100_050 - SERVER_TICK_MS;
    engine.tickRoom(room, 100_050);

    expect(room.phase).toBe("playing");
    expect(room.playerInputs.host.firing).toBe(false);
    expect(room.playerInputs.host.fireQueued).toBe(false);
    expect(Object.values(room.activeProjectiles)).toHaveLength(0);
  });

  it("respawns players on the selected map spawn set", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.mapId = MAPS[2]!.id;
    room.walls = structuredClone(MAPS[2]!.walls);
    room.players.enemy = {
      ...createPlayer("enemy", "Enemy", "#fca5a5"),
      x: 800,
      y: 520
    };

    const engine = createEngine();
    const hitTime = 110_000;
    const respawnTime = hitTime + RESPAWN_DELAY_MS;

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "enemy", "host", hitTime);
    }

    engine.respawnDuePlayers(room, respawnTime);

    const validSpawns = new Set(MAPS[2]!.spawnPoints.map((spawn) => `${spawn.x},${spawn.y}`));
    expect(validSpawns.has(`${room.players.host.x},${room.players.host.y}`)).toBe(true);
  });
});
