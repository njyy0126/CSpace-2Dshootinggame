# Room Leave, Formal E2E, and Map Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real leave-room flow that works in lobby and in-match, formalize room UI end-to-end browser automation, and slightly shrink obstacle sizes across the three maps so intended lanes are traversable.

**Architecture:** Reuse the existing authoritative room store and socket handlers for leave-room cleanup, keep client screen changes driven by room snapshot state, and add a repository-owned browser E2E layer on top of the current app. Tune map traversal by editing shared wall geometry rather than changing collision systems or spawn logic.

**Tech Stack:** TypeScript, Vite, Express, Socket.IO, Phaser 3, Vitest, browser automation via a repo-owned E2E runner

---

## File Structure Map

- `src/shared/messages.ts` - shared leave-room event payload contract
- `src/server/rooms/roomStore.ts` - authoritative player leave operation, host reassignment, room reset behavior
- `src/server/socket/registerHandlers.ts` - socket leave-room handler and Socket.IO room departure
- `src/client/net/clientSocket.ts` - client leave-room API surface
- `src/client/state/clientState.ts` - local room snapshot reset after leaving
- `src/client/ui/appViewModel.ts` - view-model flags for leave-room controls
- `src/client/app.ts` - render and wire leave-room buttons in lobby and in-game UI
- `src/client/styles.css` - layout for leave-room controls without intruding on map pointer area
- `src/shared/map.ts` - tuned obstacle dimensions for all three maps
- `tests/server/roomStore.test.ts` - explicit leave-room regression tests
- `tests/client/appFlow.test.ts` - leave-room UI view-model and screen-state tests
- `tests/shared/map.test.ts` - map safety and tuned geometry regression checks
- `package.json` - add formal E2E script(s) if needed
- `tests/e2e/*` or equivalent new directory - browser automation for full room UI flow

## Task 1: Add server-side explicit leave-room behavior with tests first

**Files:**
- Modify: `tests/server/roomStore.test.ts`
- Modify: `src/server/rooms/roomStore.ts`
- Modify: `src/server/socket/registerHandlers.ts`
- Modify: `src/shared/messages.ts`

- [ ] **Step 1: Write failing room-store tests for explicit leave behavior**

```ts
it("lets a player leave a specific room and removes their input state", () => {
  const store = createRoomStore();
  const room = store.createRoom("host", "Host");
  store.joinRoom(room.code, "guest", "Guest");

  const updatedRoom = store.leaveRoom(room.code, "guest");

  expect(updatedRoom?.players.guest).toBeUndefined();
  expect(updatedRoom?.playerInputs.guest).toBeUndefined();
});

it("reassigns the host when the host explicitly leaves a room", () => {
  const store = createRoomStore();
  const room = store.createRoom("host", "Host");
  store.joinRoom(room.code, "guest", "Guest");

  const updatedRoom = store.leaveRoom(room.code, "host");

  expect(updatedRoom?.hostId).toBe("guest");
});

it("returns an active room to the lobby when an in-match leave drops it below two eligible players", () => {
  const store = createRoomStore();
  const room = store.createRoom("host", "Host");
  store.joinRoom(room.code, "guest", "Guest");
  store.startMatch(room);

  const updatedRoom = store.leaveRoom(room.code, "guest");

  expect(updatedRoom?.phase).toBe("lobby");
  expect(updatedRoom?.activeProjectiles).toEqual({});
});
```

- [ ] **Step 2: Run the targeted room-store test to verify it fails for the expected reason**

Run: `npm test -- tests/server/roomStore.test.ts`
Expected: FAIL because `leaveRoom` does not exist yet.

- [ ] **Step 3: Extend the shared socket contract for the explicit leave-room payload**

```ts
export interface LeaveRoomPayload {
  roomCode: string;
}

export const CLIENT_EVENTS = {
  createRoom: "client:create-room",
  joinRoom: "client:join-room",
  setMatchTarget: "client:set-match-target",
  setMap: "client:set-map",
  startMatch: "client:start-match",
  leaveRoom: "client:leave-room",
  input: "client:input"
} as const;
```

- [ ] **Step 4: Implement a room-scoped leave helper in the room store**

```ts
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
}
```

- [ ] **Step 5: Wire a dedicated socket handler for explicit leave-room**

```ts
socket.on(CLIENT_EVENTS.leaveRoom, ({ roomCode }: LeaveRoomPayload) => {
  const room = store.leaveRoom(roomCode, socket.id);
  void socket.leave(roomCode);
  if (room) {
    io.to(room.code).emit(SERVER_EVENTS.roomState, room);
  }
});
```

- [ ] **Step 6: Re-run the room-store suite**

Run: `npm test -- tests/server/roomStore.test.ts`
Expected: PASS.

## Task 2: Add client-side leave-room flow and UI regression tests

**Files:**
- Modify: `tests/client/appFlow.test.ts`
- Modify: `src/client/net/clientSocket.ts`
- Modify: `src/client/state/clientState.ts`
- Modify: `src/client/ui/appViewModel.ts`
- Modify: `src/client/app.ts`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Write failing client/view-model tests for the leave-room controls**

```ts
it("shows a leave-room action in the lobby model", () => {
  const model = createAppViewModel(
    createState({
      room: createRoom(),
      localPlayerId: "host"
    })
  );

  expect(model.roomLobby?.canLeaveRoom).toBe(true);
});

it("shows a leave-room action in the in-game HUD model", () => {
  const model = createAppViewModel(
    createState({
      room: createRoom({ phase: "playing" }),
      localPlayerId: "host"
    })
  );

  expect(model.gameHud?.canLeaveRoom).toBe(true);
});
```

- [ ] **Step 2: Run the targeted client flow test to confirm failure**

Run: `npm test -- tests/client/appFlow.test.ts`
Expected: FAIL because the leave-room fields and UI contract are missing.

- [ ] **Step 3: Extend the client socket wrapper with a leave-room API**

```ts
leaveRoom(roomCode: string) {
  const payload: LeaveRoomPayload = { roomCode };
  socket.emit(CLIENT_EVENTS.leaveRoom, payload);
}
```

- [ ] **Step 4: Add local state reset helpers so leaving cleanly returns to the landing flow**

```ts
export function clearRoomState() {
  state.room = null;
  state.errorMessage = null;
  notify();
}
```

Use this helper after the leave action is initiated from the active room view so the game surface unmounts and input no longer targets the old room.

- [ ] **Step 5: Expose leave-room capability in the view model**

```ts
export interface RoomLobbyViewModel {
  // existing fields...
  canLeaveRoom: boolean;
}

export interface GameHudViewModel {
  // existing fields...
  canLeaveRoom: boolean;
}
```

Set both flags to `Boolean(localPlayerId && room.players[localPlayerId])`.

- [ ] **Step 6: Render and wire leave-room buttons in both UI surfaces**

```ts
if (actionButton?.id === "leave-room" && room) {
  clientSocket.leaveRoom(room.code);
  clearRoomState();
  return;
}
```

Lobby render target:

```ts
<button id="leave-room" class="ghost-button leave-room-button" type="button">Leave room</button>
```

In-game sidebar render target:

```ts
<button id="leave-room" class="ghost-button leave-room-button" type="button">Leave room</button>
```

- [ ] **Step 7: Add CSS so the new button stays in the sidebar / control area rather than overlapping the map**

```css
.leave-room-button {
  min-height: 52px;
}

.game-sidebar .leave-room-button {
  width: 100%;
}
```

Keep the button in `.game-sidebar` only for the in-game layout.

- [ ] **Step 8: Re-run the client flow tests**

Run: `npm test -- tests/client/appFlow.test.ts tests/client/arenaScene.test.ts`
Expected: PASS, and arena-scene pointer-region guards stay green.

## Task 3: Slightly shrink map obstacles with shared-map tests first

**Files:**
- Modify: `tests/shared/map.test.ts`
- Modify: `src/shared/map.ts`
- Optionally modify: `tests/server/spawn.test.ts`

- [ ] **Step 1: Write or extend map tests around traversal-friendly geometry**

```ts
it("keeps every map spawn point outside all walls after obstacle tuning", () => {
  for (const map of MAPS) {
    for (const spawn of map.spawnPoints) {
      expect(map.walls.some((wall) => spawnCollidesWithWall(spawn, wall))).toBe(false);
    }
  }
});

it("keeps all cover walls strictly inside the arena bounds", () => {
  for (const map of MAPS) {
    for (const wall of map.walls.filter((wall) => wall.kind === "cover")) {
      expect(wall.x).toBeGreaterThan(0);
      expect(wall.y).toBeGreaterThan(0);
      expect(wall.x + wall.width).toBeLessThan(ARENA_MAP.width);
      expect(wall.y + wall.height).toBeLessThan(ARENA_MAP.height);
    }
  }
});
```

- [ ] **Step 2: Run the shared map test file to keep a red/green checkpoint**

Run: `npm test -- tests/shared/map.test.ts`
Expected: PASS or controlled FAIL only if you added new assertions before tuning.

- [ ] **Step 3: Reduce selected obstacle widths and heights in each map by small increments**

Example edit pattern:

```ts
{
  id: "switchback-left-top-pillar",
  kind: "cover",
  destructible: true,
  x: 278,
  y: 88,
  width: 32,
  height: 208
}
```

Apply this kind of modest shrink across:

- `crossroads` central blocks and bridge pieces
- `switchback` pillars, hinges, and bridge pieces
- `citadel` gate blockers, side-lane blockers, and buttresses

Do not move or resize the boundary walls.

- [ ] **Step 4: Re-run shared and spawn-oriented tests**

Run: `npm test -- tests/shared/map.test.ts tests/server/spawn.test.ts`
Expected: PASS.

## Task 4: Add a formal browser E2E room-flow suite

**Files:**
- Modify: `package.json`
- Create: `tests/e2e/roomFlow.e2e.ts` or framework-equivalent files
- Create: any minimal E2E runner config required by the chosen browser tool

- [ ] **Step 1: Choose the lightest browser automation path that works with the current repo**

Preferred direction:

- add one browser automation dependency
- expose one script such as `npm run test:e2e`
- keep the suite focused on the room flow, not visual diffing

If using Playwright, the script shape should look like:

```json
"scripts": {
  "test:e2e": "playwright test"
}
```

- [ ] **Step 2: Write the failing E2E spec for the room flow**

Core flow skeleton:

```ts
test("room UI flow covers create, join, target, map, start, leave, and re-entry", async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();

  await host.goto(baseUrl);
  await guest.goto(baseUrl);

  // host creates room
  // guest joins by room code
  // host changes target
  // host changes map
  // host starts match
  // guest leaves via in-game leave button
  // guest returns to landing
  // host sees roster update
});
```

- [ ] **Step 3: Run the E2E suite to verify the failure is real and points at missing behavior or wiring**

Run: `npm run test:e2e`
Expected: FAIL initially until the leave-room UI and selectors are in place.

- [ ] **Step 4: Implement stable selectors and condition-based waits in the app**

Examples:

```ts
<button id="leave-room" data-testid="leave-room" ...>Leave room</button>
<h2 data-testid="room-code">Room ${escapeHtml(lobby.roomCode)}</h2>
```

Use visible state transitions instead of fixed delays in the E2E script.

- [ ] **Step 5: Expand the E2E to cover post-match return and re-entry**

Add one of:

- a scripted fast-win sequence through real browser input if practical, or
- a deterministic helper route / test-only harness only if absolutely necessary

Prefer the real UI route first.

- [ ] **Step 6: Re-run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS.

## Task 5: Run full verification and browser self-check

**Files:**
- No code changes required unless verification reveals a bug

- [ ] **Step 1: Run the full unit/integration suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run the formal browser E2E suite**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Start the local app and perform a quick live browser spot-check**

Check:

- lobby leave-room button works
- in-game leave-room button works
- leaving does not leave stale HUD or stale map input active
- tuned map lanes feel traversable

## Test Plan

- `npm test -- tests/server/roomStore.test.ts`
- `npm test -- tests/client/appFlow.test.ts tests/client/arenaScene.test.ts`
- `npm test -- tests/shared/map.test.ts tests/server/spawn.test.ts`
- `npm test`
- `npm run build`
- `npm run test:e2e`

## Assumptions

- The workspace is not currently a git repository, so commit steps are intentionally omitted.
- Existing room reset rules remain the source of truth for "too few players left in an active match."
- The new E2E layer should be kept intentionally narrow and reliable rather than broad and flaky.
