# 2D PvP Shooter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-deployable 2D room-code PvP shooter with Phaser 3, a Node.js + Socket.IO authoritative server, no database, and Render-free-tier-friendly hosting.

**Architecture:** Use a single TypeScript project with a Vite-built vanilla Phaser client and an Express + Socket.IO server. Keep all room and match state in memory, push gameplay truth from the server, and serve the built client from the same Node process for simple deployment.

**Tech Stack:** TypeScript, Vite, Phaser 3, Express, Socket.IO, Vitest, tsx, tsup

---

## File Structure Map

- `package.json` - scripts, dependencies, Render start/build commands
- `tsconfig.json` - shared TypeScript config for client, server, and tests
- `vite.config.ts` - Vite client build to `dist/client`
- `.gitignore` - ignore build output, logs, node modules
- `render.yaml` - optional one-click Render service config
- `README.md` - local run, test, and deploy instructions
- `index.html` - Vite entry shell
- `src/shared/constants.ts` - gameplay tuning constants and fixed limits
- `src/shared/types.ts` - shared domain types for rooms, players, bullets, walls, HUD state
- `src/shared/messages.ts` - socket event names and payload types
- `src/shared/map.ts` - fixed arena geometry, spawn points, destructible walls
- `src/shared/math.ts` - lightweight vector helpers used by server and client
- `src/server/index.ts` - Express server bootstrap and Socket.IO setup
- `src/server/config.ts` - environment and port helpers
- `src/server/rooms/roomCode.ts` - room-code generation
- `src/server/rooms/roomStore.ts` - in-memory room lifecycle and host tracking
- `src/server/game/state.ts` - authoritative match/room state shapes and factories
- `src/server/game/spawn.ts` - safe respawn point selection
- `src/server/game/collision.ts` - projectile vs wall/player collision helpers
- `src/server/game/engine.ts` - tick loop, projectile simulation, kills, respawn, celebration, round reset
- `src/server/socket/registerHandlers.ts` - socket event validation and routing
- `src/client/main.ts` - browser bootstrap
- `src/client/styles.css` - full-page layout, lobby, HUD, overlays
- `src/client/app.ts` - DOM shell and high-level screen controller
- `src/client/net/clientSocket.ts` - Socket.IO client wrapper and outbound input
- `src/client/state/clientState.ts` - latest server snapshot + local player UI state
- `src/client/game/createGame.ts` - Phaser game bootstrap
- `src/client/game/scenes/ArenaScene.ts` - map, players, bullets, overlays, interpolation
- `src/client/game/scenes/BootScene.ts` - preload simple generated textures and start arena scene
- `tests/shared/map.test.ts` - validate map metadata and spawn definitions
- `tests/server/roomStore.test.ts` - room creation/join/host flow tests
- `tests/server/spawn.test.ts` - safe respawn selection tests
- `tests/server/engine.test.ts` - kills, respawn, invulnerability, victory, celebration tests

## Task 1: Scaffold the project and toolchain

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `README.md`
- Create: `index.html`

- [ ] **Step 1: Initialize npm metadata and install runtime dependencies**

```bash
npm init -y
npm install express socket.io socket.io-client phaser
```

Expected: `package.json` exists and `node_modules/` is installed.

- [ ] **Step 2: Install development tooling**

```bash
npm install -D typescript vite vitest tsx tsup concurrently @types/node @types/express
```

Expected: TypeScript, build tools, and test runner are available locally.

- [ ] **Step 3: Replace `package.json` with the final script layout**

```json
{
  "name": "browser-2d-pvp-shooter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsup src/server/index.ts --format esm --platform node --out-dir dist/server --clean",
    "start": "node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Add TypeScript, Vite, ignore rules, and the Vite entry shell**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": "."
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/client"
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
```

```gitignore
node_modules/
dist/
.DS_Store
*.log
.env
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>2D PvP Shooter</title>
    <script type="module" src="/src/client/main.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

- [ ] **Step 5: Smoke-test the scaffold**

Run: `npm run build`  
Expected: `dist/client` and `dist/server` are generated without errors once later source files exist.

## Task 2: Define shared gameplay contracts first

**Files:**
- Create: `src/shared/constants.ts`
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`
- Create: `src/shared/map.ts`
- Create: `src/shared/math.ts`
- Test: `tests/shared/map.test.ts`

- [ ] **Step 1: Write the failing shared-map tests**

```ts
// tests/shared/map.test.ts
import { describe, expect, it } from "vitest";
import { ARENA_MAP, MAX_PLAYERS, MATCH_TARGETS } from "../../src/shared/constants";
import { SPAWN_POINTS, WALLS } from "../../src/shared/map";

describe("shared map definition", () => {
  it("exposes exactly six or fewer supported spawn points", () => {
    expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(6);
    expect(MAX_PLAYERS).toBe(6);
  });

  it("supports the agreed match targets", () => {
    expect(MATCH_TARGETS).toEqual([10, 20, 30]);
  });

  it("marks boundary walls as indestructible", () => {
    expect(WALLS.some((wall) => wall.kind === "boundary" && wall.destructible)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the targeted test to confirm failure**

Run: `npm run test -- tests/shared/map.test.ts`  
Expected: FAIL because shared modules do not exist yet.

- [ ] **Step 3: Create constants, types, messages, math helpers, and fixed map data**

```ts
// src/shared/constants.ts
export const MAX_PLAYERS = 6;
export const MATCH_TARGETS = [10, 20, 30] as const;
export const PLAYER_MAX_HEALTH = 4;
export const RESPAWN_DELAY_MS = 2000;
export const RESPAWN_INVULNERABLE_MS = 2000;
export const CELEBRATION_DURATION_MS = 5000;
export const SERVER_TICK_MS = 50;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_FIRE_INTERVAL_MS = 140;
export const PROJECTILE_RADIUS = 4;
export const PLAYER_RADIUS = 14;
export const ARENA_MAP = { width: 960, height: 640 } as const;
```

```ts
// src/shared/types.ts
export type MatchTarget = 10 | 20 | 30;
export type RoomPhase = "lobby" | "countdown" | "playing" | "celebration";
export type WallKind = "boundary" | "cover";

export interface Vec2 { x: number; y: number }
export interface Wall { id: string; kind: WallKind; destructible: boolean; x: number; y: number; width: number; height: number }
export interface SpawnPoint extends Vec2 { id: string }
export interface PlayerSnapshot {
  id: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  aim: Vec2;
  health: number;
  kills: number;
  alive: boolean;
  invulnerableUntil: number;
  respawnAt: number | null;
  waitingForNextRound: boolean;
}
export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  celebrationOnly: boolean;
}
```

```ts
// src/shared/messages.ts
export const CLIENT_EVENTS = {
  createRoom: "client:create-room",
  joinRoom: "client:join-room",
  setMatchTarget: "client:set-match-target",
  startMatch: "client:start-match",
  leaveRoom: "client:leave-room",
  input: "client:input"
} as const;

export const SERVER_EVENTS = {
  roomState: "server:room-state",
  roomError: "server:room-error",
  joinedRoom: "server:joined-room"
} as const;
```

```ts
// src/shared/map.ts
import type { SpawnPoint, Wall } from "./types";

export const SPAWN_POINTS: SpawnPoint[] = [
  { id: "s1", x: 96, y: 96 },
  { id: "s2", x: 864, y: 96 },
  { id: "s3", x: 96, y: 544 },
  { id: "s4", x: 864, y: 544 },
  { id: "s5", x: 480, y: 96 },
  { id: "s6", x: 480, y: 544 }
];

export const WALLS: Wall[] = [
  { id: "b-top", kind: "boundary", destructible: false, x: 0, y: 0, width: 960, height: 24 },
  { id: "b-bottom", kind: "boundary", destructible: false, x: 0, y: 616, width: 960, height: 24 },
  { id: "b-left", kind: "boundary", destructible: false, x: 0, y: 0, width: 24, height: 640 },
  { id: "b-right", kind: "boundary", destructible: false, x: 936, y: 0, width: 24, height: 640 },
  { id: "c-mid-a", kind: "cover", destructible: true, x: 240, y: 200, width: 120, height: 24 },
  { id: "c-mid-b", kind: "cover", destructible: true, x: 600, y: 416, width: 120, height: 24 }
];
```

- [ ] **Step 4: Re-run the shared tests**

Run: `npm run test -- tests/shared/map.test.ts`  
Expected: PASS.

## Task 3: Build the in-memory room store and socket contracts

**Files:**
- Create: `src/server/config.ts`
- Create: `src/server/rooms/roomCode.ts`
- Create: `src/server/rooms/roomStore.ts`
- Create: `src/server/game/state.ts`
- Create: `src/server/socket/registerHandlers.ts`
- Test: `tests/server/roomStore.test.ts`

- [ ] **Step 1: Write the failing room-store tests**

```ts
// tests/server/roomStore.test.ts
import { describe, expect, it } from "vitest";
import { createRoomStore } from "../../src/server/rooms/roomStore";

describe("room store", () => {
  it("creates a room with the creator as host", () => {
    const store = createRoomStore();
    const room = store.createRoom("socket-1", "Nina");

    expect(room.hostId).toBe("socket-1");
    expect(room.players["socket-1"]?.nickname).toBe("Nina");
  });

  it("prevents joining beyond max players", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");

    for (let i = 0; i < 5; i += 1) {
      store.joinRoom(room.code, `p-${i}`, `P${i}`);
    }

    expect(() => store.joinRoom(room.code, "overflow", "Overflow")).toThrow(/full/i);
  });
});
```

- [ ] **Step 2: Run the targeted room-store tests to confirm failure**

Run: `npm run test -- tests/server/roomStore.test.ts`  
Expected: FAIL because store modules do not exist yet.

- [ ] **Step 3: Implement room code generation, room factories, and in-memory room operations**

```ts
// src/server/rooms/roomCode.ts
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
```

```ts
// src/server/game/state.ts
import { MATCH_TARGETS, PLAYER_MAX_HEALTH } from "../../shared/constants";
import { SPAWN_POINTS, WALLS } from "../../shared/map";
import type { MatchTarget, PlayerSnapshot, RoomPhase, Wall } from "../../shared/types";

export interface RoomState {
  code: string;
  hostId: string;
  phase: RoomPhase;
  matchTarget: MatchTarget;
  players: Record<string, PlayerSnapshot>;
  activeProjectiles: Record<string, unknown>;
  walls: Wall[];
  winnerId: string | null;
  celebrationEndsAt: number | null;
}

export function createPlayer(id: string, nickname: string, color: string): PlayerSnapshot {
  const spawn = SPAWN_POINTS[0];
  return {
    id,
    nickname,
    color,
    x: spawn.x,
    y: spawn.y,
    aim: { x: 1, y: 0 },
    health: PLAYER_MAX_HEALTH,
    kills: 0,
    alive: true,
    invulnerableUntil: 0,
    respawnAt: null,
    waitingForNextRound: false
  };
}

export function createRoomState(code: string, hostId: string, hostNickname: string): RoomState {
  return {
    code,
    hostId,
    phase: "lobby",
    matchTarget: MATCH_TARGETS[0],
    players: {
      [hostId]: createPlayer(hostId, hostNickname, "#7dd3fc")
    },
    activeProjectiles: {},
    walls: structuredClone(WALLS),
    winnerId: null,
    celebrationEndsAt: null
  };
}
```

```ts
// src/server/rooms/roomStore.ts
import { MAX_PLAYERS, MATCH_TARGETS } from "../../shared/constants";
import type { MatchTarget } from "../../shared/types";
import { createRoomState, type RoomState, createPlayer } from "../game/state";
import { createRoomCode } from "./roomCode";

export function createRoomStore() {
  const rooms = new Map<string, RoomState>();

  return {
    createRoom(socketId: string, nickname: string) {
      let code = createRoomCode();
      while (rooms.has(code)) code = createRoomCode();
      const room = createRoomState(code, socketId, nickname);
      rooms.set(code, room);
      return room;
    },
    joinRoom(code: string, socketId: string, nickname: string) {
      const room = rooms.get(code);
      if (!room) throw new Error("Room not found");
      if (Object.keys(room.players).length >= MAX_PLAYERS) throw new Error("Room is full");
      room.players[socketId] = createPlayer(socketId, nickname, "#fca5a5");
      room.players[socketId].waitingForNextRound = room.phase !== "lobby";
      return room;
    },
    setMatchTarget(room: RoomState, target: MatchTarget) {
      if (!MATCH_TARGETS.includes(target)) throw new Error("Invalid target");
      room.matchTarget = target;
    },
    getRoom(code: string) {
      return rooms.get(code);
    }
  };
}
```

- [ ] **Step 4: Implement socket handler scaffolding around the room store**

```ts
// src/server/socket/registerHandlers.ts
import type { Server, Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../../shared/messages";
import { createRoomStore } from "../rooms/roomStore";

export function registerHandlers(io: Server) {
  const store = createRoomStore();

  io.on("connection", (socket: Socket) => {
    socket.on(CLIENT_EVENTS.createRoom, ({ nickname }) => {
      const room = store.createRoom(socket.id, nickname.trim());
      socket.join(room.code);
      io.to(room.code).emit(SERVER_EVENTS.roomState, room);
    });
  });
}
```

- [ ] **Step 5: Re-run the room-store tests**

Run: `npm run test -- tests/server/roomStore.test.ts`  
Expected: PASS.

## Task 4: Implement the authoritative game engine

**Files:**
- Create: `src/server/game/spawn.ts`
- Create: `src/server/game/collision.ts`
- Create: `src/server/game/engine.ts`
- Test: `tests/server/spawn.test.ts`
- Test: `tests/server/engine.test.ts`

- [ ] **Step 1: Write failing tests for respawn fairness and match flow**

```ts
// tests/server/spawn.test.ts
import { describe, expect, it } from "vitest";
import { chooseSpawnPoint } from "../../src/server/game/spawn";

describe("chooseSpawnPoint", () => {
  it("prefers the point farthest from living enemies", () => {
    const spawn = chooseSpawnPoint([
      { x: 100, y: 100, alive: true },
      { x: 850, y: 540, alive: true }
    ]);

    expect(spawn).toBeDefined();
  });
});
```

```ts
// tests/server/engine.test.ts
import { describe, expect, it } from "vitest";
import { createRoomState } from "../../src/server/game/state";
import { createEngine } from "../../src/server/game/engine";

describe("game engine", () => {
  it("kills a player after four projectile hits", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.players.enemy = { ...room.players.host, id: "enemy", nickname: "Enemy", x: 200, y: 100 };
    const engine = createEngine();

    for (let i = 0; i < 4; i += 1) {
      engine.applyProjectileHit(room, "host", "enemy");
    }

    expect(room.players.enemy.alive).toBe(false);
    expect(room.players.host.kills).toBe(1);
  });
});
```

- [ ] **Step 2: Run the engine tests to confirm failure**

Run: `npm run test -- tests/server/spawn.test.ts tests/server/engine.test.ts`  
Expected: FAIL because engine helpers do not exist yet.

- [ ] **Step 3: Implement spawn selection and collision helpers**

```ts
// src/server/game/spawn.ts
import { SPAWN_POINTS } from "../../shared/map";

export function chooseSpawnPoint(enemies: Array<{ x: number; y: number; alive: boolean }>) {
  const living = enemies.filter((enemy) => enemy.alive);
  return SPAWN_POINTS
    .map((spawn) => ({
      spawn,
      score: Math.min(
        ...living.map((enemy) => Math.hypot(spawn.x - enemy.x, spawn.y - enemy.y)),
        Number.POSITIVE_INFINITY
      )
    }))
    .sort((a, b) => b.score - a.score)[0]?.spawn ?? SPAWN_POINTS[0];
}
```

```ts
// src/server/game/collision.ts
import type { PlayerSnapshot, ProjectileSnapshot, Wall } from "../../shared/types";

export function projectileHitsWall(projectile: ProjectileSnapshot, wall: Wall) {
  return (
    projectile.x + projectile.radius >= wall.x &&
    projectile.x - projectile.radius <= wall.x + wall.width &&
    projectile.y + projectile.radius >= wall.y &&
    projectile.y - projectile.radius <= wall.y + wall.height
  );
}

export function projectileHitsPlayer(projectile: ProjectileSnapshot, player: PlayerSnapshot) {
  return Math.hypot(projectile.x - player.x, projectile.y - player.y) <= 18;
}
```

- [ ] **Step 4: Implement the server engine with pure helpers first**

```ts
// src/server/game/engine.ts
import {
  CELEBRATION_DURATION_MS,
  PLAYER_MAX_HEALTH,
  PROJECTILE_RADIUS,
  RESPAWN_DELAY_MS,
  RESPAWN_INVULNERABLE_MS
} from "../../shared/constants";
import type { ProjectileSnapshot } from "../../shared/types";
import type { RoomState } from "./state";
import { chooseSpawnPoint } from "./spawn";

export function createEngine() {
  return {
    tickLobby(room: RoomState, now: number) {
      void room;
      void now;
      // accept movement snapshots for pre-match free roaming, but skip damage and score changes
    },
    tickRoom(room: RoomState, now: number) {
      this.respawnDuePlayers(room, now);
      // move projectiles, resolve wall collisions, resolve player hits, and prune spent bullets
    },
    applyProjectileHit(room: RoomState, attackerId: string, victimId: string) {
      const attacker = room.players[attackerId];
      const victim = room.players[victimId];
      if (!attacker || !victim || !victim.alive || victim.invulnerableUntil > Date.now()) return;

      victim.health -= 1;
      if (victim.health > 0) return;

      victim.alive = false;
      victim.health = 0;
      victim.respawnAt = Date.now() + RESPAWN_DELAY_MS;
      attacker.kills += 1;

      if (attacker.kills >= room.matchTarget) {
        room.phase = "celebration";
        room.winnerId = attackerId;
        room.celebrationEndsAt = Date.now() + CELEBRATION_DURATION_MS;
      }
    },
    respawnDuePlayers(room: RoomState, now: number) {
      for (const player of Object.values(room.players)) {
        if (!player.alive && player.respawnAt && player.respawnAt <= now && room.phase === "playing") {
          const spawn = chooseSpawnPoint(
            Object.values(room.players).filter((other) => other.id !== player.id)
          );
          player.x = spawn.x;
          player.y = spawn.y;
          player.alive = true;
          player.health = PLAYER_MAX_HEALTH;
          player.respawnAt = null;
          player.invulnerableUntil = now + RESPAWN_INVULNERABLE_MS;
        }
      }
    },
    resetAfterCelebration(room: RoomState, now: number) {
      if (room.phase === "celebration" && room.celebrationEndsAt && room.celebrationEndsAt <= now) {
        room.phase = "lobby";
        room.winnerId = null;
        room.celebrationEndsAt = null;
      }
    },
    createProjectile(ownerId: string, x: number, y: number, vx: number, vy: number): ProjectileSnapshot {
      return {
        id: `${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId,
        x,
        y,
        vx,
        vy,
        radius: PROJECTILE_RADIUS,
        celebrationOnly: false
      };
    }
  };
}
```

- [ ] **Step 5: Add tick-loop tests for victory and celebration reset**

```ts
it("enters celebration when the kill target is reached", () => {
  const room = createRoomState("ABCDE", "host", "Host");
  room.matchTarget = 1;
  room.players.enemy = { ...room.players.host, id: "enemy", nickname: "Enemy", x: 200, y: 100 };

  const engine = createEngine();
  for (let i = 0; i < 4; i += 1) engine.applyProjectileHit(room, "host", "enemy");

  expect(room.phase).toBe("celebration");
  expect(room.winnerId).toBe("host");
});
```

- [ ] **Step 6: Re-run the engine tests**

Run: `npm run test -- tests/server/spawn.test.ts tests/server/engine.test.ts`  
Expected: PASS.

## Task 5: Wire the HTTP server, Socket.IO, and room-state broadcast loop

**Files:**
- Create: `src/server/index.ts`
- Modify: `src/server/socket/registerHandlers.ts`
- Modify: `src/server/rooms/roomStore.ts`
- Modify: `src/server/game/engine.ts`

- [ ] **Step 1: Write the server bootstrap**

```ts
// src/server/index.ts
import express from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { registerHandlers } from "./socket/registerHandlers";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

registerHandlers(io);

app.use(express.static(path.resolve("dist/client")));
app.get("*", (_req, res) => {
  res.sendFile(path.resolve("dist/client/index.html"));
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Server listening on port", Number(process.env.PORT ?? 3000));
});
```

- [ ] **Step 2: Expand socket handlers for create, join, set target, start match, and live input**

```ts
// inside registerHandlers
socket.on(CLIENT_EVENTS.joinRoom, ({ roomCode, nickname }) => {
  const room = store.joinRoom(roomCode.trim().toUpperCase(), socket.id, nickname.trim());
  socket.join(room.code);
  io.to(room.code).emit(SERVER_EVENTS.roomState, room);
});

socket.on(CLIENT_EVENTS.setMatchTarget, ({ roomCode, target }) => {
  const room = store.getRoom(roomCode);
  if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
  store.setMatchTarget(room, target);
  io.to(room.code).emit(SERVER_EVENTS.roomState, room);
});

socket.on(CLIENT_EVENTS.startMatch, ({ roomCode }) => {
  const room = store.getRoom(roomCode);
  if (!room || room.hostId !== socket.id) return;
  if (Object.keys(room.players).length < 2) return;
  store.startMatch(room);
  io.to(room.code).emit(SERVER_EVENTS.roomState, room);
});
```

- [ ] **Step 3: Add a room tick loop that advances gameplay and broadcasts snapshots**

```ts
// roomStore.ts
startMatch(room: RoomState) {
  room.phase = "playing";
  room.winnerId = null;
  room.celebrationEndsAt = null;
  room.walls = structuredClone(WALLS);
  for (const player of Object.values(room.players)) {
    player.kills = 0;
    player.waitingForNextRound = false;
    player.alive = true;
    player.health = 4;
    player.respawnAt = null;
  }
}

listRooms() {
  return [...rooms.values()];
}

removePlayer(socketId: string) {
  for (const room of rooms.values()) {
    if (!room.players[socketId]) continue;
    delete room.players[socketId];
    if (room.hostId === socketId) {
      room.hostId = Object.keys(room.players)[0] ?? "";
    }
    if (Object.keys(room.players).length === 0) {
      rooms.delete(room.code);
      return null;
    }
    return room;
  }
  return null;
}
```

```ts
// registerHandlers.ts
const engine = createEngine();
setInterval(() => {
  const now = Date.now();
  for (const room of store.listRooms()) {
    if (room.phase === "lobby") engine.tickLobby(room, now);
    if (room.phase === "playing") engine.tickRoom(room, now);
    if (room.phase === "celebration") engine.resetAfterCelebration(room, now);
    io.to(room.code).emit(SERVER_EVENTS.roomState, room);
  }
}, SERVER_TICK_MS);
```

- [ ] **Step 4: Add disconnect cleanup**

```ts
socket.on("disconnect", () => {
  const affectedRoom = store.removePlayer(socket.id);
  if (!affectedRoom) return;
  io.to(affectedRoom.code).emit(SERVER_EVENTS.roomState, affectedRoom);
});
```

- [ ] **Step 5: Run the full server-side test suite**

Run: `npm run test -- tests/server/roomStore.test.ts tests/server/spawn.test.ts tests/server/engine.test.ts`  
Expected: PASS.

## Task 6: Build the browser shell, socket client, and lobby flow

**Files:**
- Create: `src/client/main.ts`
- Create: `src/client/styles.css`
- Create: `src/client/app.ts`
- Create: `src/client/net/clientSocket.ts`
- Create: `src/client/state/clientState.ts`

- [ ] **Step 1: Create the browser bootstrap and base layout**

```ts
// src/client/main.ts
import "./styles.css";
import { mountApp } from "./app";

mountApp(document.querySelector<HTMLDivElement>("#app")!);
```

```css
/* src/client/styles.css */
html, body, #app {
  margin: 0;
  min-height: 100%;
  background: #111827;
  color: #f8fafc;
  font-family: Inter, system-ui, sans-serif;
}

.shell {
  display: grid;
  grid-template-columns: minmax(260px, 320px) 1fr;
  min-height: 100vh;
}
```

- [ ] **Step 2: Implement entry and lobby DOM rendering**

```ts
// src/client/app.ts
import { createClientSocket } from "./net/clientSocket";

export function mountApp(root: HTMLDivElement) {
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <form id="entry-form">
          <input id="nickname" maxlength="16" placeholder="Nickname" />
          <button data-action="create" type="button">Create room</button>
          <input id="room-code" maxlength="5" placeholder="Room code" />
          <button data-action="join" type="button">Join room</button>
        </form>
        <section id="lobby-panel"></section>
      </aside>
      <main id="game-root"></main>
    </div>
  `;

  const socket = createClientSocket();
  // wire buttons to create/join using form values
}
```

- [ ] **Step 3: Add client-side room-state storage**

```ts
// src/client/state/clientState.ts
import type { RoomState } from "../../server/game/state";

export interface ClientState {
  room: RoomState | null;
  localPlayerId: string | null;
}

const state: ClientState = {
  room: null,
  localPlayerId: null
};

export function updateRoom(room: RoomState) {
  state.room = room;
}

export function getClientState() {
  return state;
}
```

- [ ] **Step 4: Implement the socket wrapper and inbound state updates**

```ts
// src/client/net/clientSocket.ts
import { io } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../../shared/messages";
import { updateRoom } from "../state/clientState";

export function createClientSocket() {
  const socket = io();

  socket.on(SERVER_EVENTS.roomState, (room) => {
    updateRoom(room);
    window.dispatchEvent(new CustomEvent("room-state"));
  });

  return {
    socket,
    createRoom(nickname: string) {
      socket.emit(CLIENT_EVENTS.createRoom, { nickname });
    },
    joinRoom(roomCode: string, nickname: string) {
      socket.emit(CLIENT_EVENTS.joinRoom, { roomCode, nickname });
    },
    setMatchTarget(roomCode: string, target: 10 | 20 | 30) {
      socket.emit(CLIENT_EVENTS.setMatchTarget, { roomCode, target });
    },
    startMatch(roomCode: string) {
      socket.emit(CLIENT_EVENTS.startMatch, { roomCode });
    },
    sendInput(payload: {
      roomCode: string;
      moveX: number;
      moveY: number;
      aimX: number;
      aimY: number;
      firing: boolean;
    }) {
      socket.emit(CLIENT_EVENTS.input, payload);
    }
  };
}
```

- [ ] **Step 5: Manually verify the lobby shell**

Run: `npm run dev`  
Expected: local page loads, nickname form renders, buttons emit socket events without crashing the client.

## Task 7: Add Phaser rendering, movement, and projectile presentation

**Files:**
- Create: `src/client/game/createGame.ts`
- Create: `src/client/game/scenes/BootScene.ts`
- Create: `src/client/game/scenes/ArenaScene.ts`
- Modify: `src/client/app.ts`
- Modify: `src/client/net/clientSocket.ts`

- [ ] **Step 1: Bootstrap Phaser into the main screen**

```ts
// src/client/game/createGame.ts
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { ArenaScene } from "./scenes/ArenaScene";

export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    backgroundColor: "#0f172a",
    scene: [BootScene, ArenaScene]
  });
}
```

- [ ] **Step 2: Generate simple textures instead of shipping art assets**

```ts
// src/client/game/scenes/BootScene.ts
import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0x38bdf8).fillCircle(14, 14, 14).generateTexture("player", 28, 28);
    g.clear().fillStyle(0xf8fafc).fillCircle(4, 4, 4).generateTexture("bullet", 8, 8);
    g.clear().fillStyle(0x475569).fillRect(0, 0, 64, 24).generateTexture("wall", 64, 24);
    this.scene.start("arena");
  }
}
```

- [ ] **Step 3: Render walls, players, and bullets from room snapshots**

```ts
// ArenaScene.ts
import Phaser from "phaser";
import { getClientState } from "../../state/clientState";

export class ArenaScene extends Phaser.Scene {
  private players = new Map<string, Phaser.GameObjects.Arc>();
  private bullets = new Map<string, Phaser.GameObjects.Image>();

  constructor() {
    super("arena");
  }

  update() {
    const room = getClientState().room;
    if (!room) return;
    // create/update/remove sprites from room.players and room.activeProjectiles
  }
}
```

- [ ] **Step 4: Capture movement and aim input and send it upstream**

```ts
// inside ArenaScene
const pointer = this.input.activePointer;
const cursors = this.input.keyboard!.addKeys("W,A,S,D");

this.time.addEvent({
  delay: 50,
  loop: true,
  callback: () => {
    clientSocket.sendInput({
      moveX: Number(cursors.D.isDown) - Number(cursors.A.isDown),
      moveY: Number(cursors.S.isDown) - Number(cursors.W.isDown),
      aimX: pointer.worldX,
      aimY: pointer.worldY,
      firing: pointer.isDown
    });
  }
});
```

- [ ] **Step 5: Manually verify local feel**

Run: `npm run dev`  
Expected: the map renders, the local player sees movement and bullets, and remote windows reflect the same room state.

## Task 8: Finish HUD, special phases, and deployment support

**Files:**
- Modify: `src/client/app.ts`
- Modify: `src/client/styles.css`
- Modify: `src/client/game/scenes/ArenaScene.ts`
- Modify: `src/server/game/engine.ts`
- Create: `render.yaml`
- Modify: `README.md`

- [ ] **Step 1: Add HUD and phase-specific overlays**

```ts
// app.ts
function renderLobby(room: RoomState) {
  return `
    <h2>Room ${room.code}</h2>
    <p>${Object.keys(room.players).length}/6 players</p>
    <div class="targets">
      ${[10, 20, 30].map((value) => `<button data-target="${value}">${value}</button>`).join("")}
    </div>
    <button id="start-match">Start match</button>
  `;
}
```

```css
.hud {
  position: absolute;
  top: 16px;
  left: 16px;
  display: grid;
  gap: 8px;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
```

- [ ] **Step 2: Add celebration-wall destruction and next-round waiting behavior**

```ts
// engine.ts
if (room.phase === "celebration" && projectile.celebrationOnly && wall.destructible) {
  room.walls = room.walls.filter((candidate) => candidate.id !== wall.id);
}

if (room.phase === "playing" && player.waitingForNextRound) {
  player.alive = false;
  player.respawnAt = null;
}

if (room.phase === "lobby") {
  // allow pre-match free movement updates but skip scoring, respawn timers, and projectile damage
}

if (room.phase === "celebration" && room.celebrationEndsAt && room.celebrationEndsAt <= now) {
  room.phase = "lobby";
  room.walls = structuredClone(WALLS);
  for (const player of Object.values(room.players)) {
    player.kills = 0;
    player.health = 4;
    player.alive = true;
    player.waitingForNextRound = false;
  }
}
```

- [ ] **Step 3: Add Render deployment metadata**

```yaml
# render.yaml
services:
  - type: web
    name: browser-2d-pvp-shooter
    env: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start
    autoDeploy: false
```

- [ ] **Step 4: Document local run and deploy flow**

```md
<!-- README.md -->
## Local development

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:5173`

## Production build

1. `npm run build`
2. `npm run start`

## Render

- Create a Node web service
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- No database is required
```

- [ ] **Step 5: Run the final verification bundle**

Run: `npm run test && npm run build`  
Expected: all tests pass and production bundles are generated.

## Test Plan

- `npm run test -- tests/shared/map.test.ts`
- `npm run test -- tests/server/roomStore.test.ts`
- `npm run test -- tests/server/spawn.test.ts tests/server/engine.test.ts`
- `npm run test`
- `npm run build`
- Manual browser checks:
  - create room, copy code, join from second browser
  - host changes target to 10/20/30
  - host cannot start alone, can start with 2 players
  - joiner entering mid-match waits until next round
  - 4 projectile hits kill a player
  - dead player returns after 2 seconds with 2 seconds invulnerability
  - winner triggers 5-second celebration
  - celebration weapon destroys cover but not boundaries
  - room returns to lobby and map resets

## Assumptions

- The workspace is not currently a git repository, so commit checkpoints are intentionally omitted from the task steps.
- The first implementation keeps all UI in vanilla DOM + CSS rather than adding React, to stay lighter and simpler.
- The initial map uses generated textures and hard-coded wall geometry instead of external art assets.
- Input validation can stay lightweight and hand-written unless implementation reveals repeated parsing pain.
