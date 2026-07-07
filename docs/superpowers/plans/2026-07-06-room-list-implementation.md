# Landing Room List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a landing-page room list with manual refresh and direct join actions, while exposing only safe room summaries from the server.

**Architecture:** Extend the existing Socket.IO contract with a request/response room-list path, derive safe room summaries from the authoritative room store, and render the new landing panel through the current client view-model and DOM shell. Keep refresh manual and keep join permissions driven by room phase.

**Tech Stack:** TypeScript, Vite, Express, Socket.IO, Vitest, Playwright

---

## File Structure Map

- `src/shared/types.ts` - shared room-summary type
- `src/shared/messages.ts` - room-list request/response events and payloads
- `src/server/rooms/roomStore.ts` - derive room-summary list from current room state
- `src/server/socket/registerHandlers.ts` - respond to room-list requests
- `src/client/state/clientState.ts` - persist room-list data and loading state
- `src/client/net/clientSocket.ts` - request room list and store responses
- `src/client/ui/appViewModel.ts` - shape landing-page room-list model and joinability
- `src/client/app.ts` - render landing room list and wire refresh / join buttons
- `src/client/styles.css` - style the new room-list panel and rows
- `tests/server/roomStore.test.ts` - room-summary regression tests
- `tests/client/appFlow.test.ts` - landing room-list view-model tests
- `tests/e2e/roomFlow.spec.ts` - refresh-and-join-from-list browser flow

### Task 1: Add shared room-list contract and server summary API

**Files:**
- Modify: `tests/server/roomStore.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/server/rooms/roomStore.ts`
- Modify: `src/server/socket/registerHandlers.ts`

- [ ] **Step 1: Write the failing server tests for room summaries**

```ts
it("lists room summaries with host nickname, player count, phase, and map", () => {
  const store = createRoomStore();
  const firstRoom = store.createRoom("host", "Host");
  store.joinRoom(firstRoom.code, "guest", "Guest");
  const secondRoom = store.createRoom("host-2", "Other Host");
  store.updateMap(secondRoom.code, "host-2", MAPS[1]!.id);
  store.startMatchByHost(firstRoom.code, "host");

  const summaries = store.listRoomSummaries();

  expect(summaries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: firstRoom.code,
        hostNickname: "Host",
        playerCount: 2,
        phase: "playing"
      }),
      expect.objectContaining({
        code: secondRoom.code,
        hostNickname: "Other Host",
        playerCount: 1,
        mapId: MAPS[1]!.id
      })
    ])
  );
});
```

- [ ] **Step 2: Run the targeted room-store suite to verify failure**

Run: `npm test -- tests/server/roomStore.test.ts`
Expected: FAIL because `listRoomSummaries` does not exist yet.

- [ ] **Step 3: Add shared room-summary and socket payload types**

```ts
export interface RoomSummary {
  code: string;
  hostNickname: string;
  playerCount: number;
  phase: RoomPhase;
  mapId: MapId;
}
```

```ts
export const CLIENT_EVENTS = {
  // existing events...
  requestRoomList: "client:request-room-list"
} as const;

export const SERVER_EVENTS = {
  // existing events...
  roomList: "server:room-list"
} as const;

export interface ServerRoomListPayload {
  rooms: RoomSummary[];
}
```

- [ ] **Step 4: Implement `listRoomSummaries()` in the room store**

```ts
listRoomSummaries() {
  return [...rooms.values()]
    .map((room) => ({
      code: room.code,
      hostNickname: room.players[room.hostId]?.nickname ?? "Unknown",
      playerCount: Object.keys(room.players).length,
      phase: room.phase,
      mapId: room.mapId
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}
```

- [ ] **Step 5: Add the socket handler for room-list requests**

```ts
socket.on(CLIENT_EVENTS.requestRoomList, () => {
  socket.emit(SERVER_EVENTS.roomList, {
    rooms: store.listRoomSummaries()
  });
});
```

- [ ] **Step 6: Re-run the room-store suite**

Run: `npm test -- tests/server/roomStore.test.ts`
Expected: PASS.

### Task 2: Add landing-page room-list client state and view-model coverage

**Files:**
- Modify: `tests/client/appFlow.test.ts`
- Modify: `src/client/state/clientState.ts`
- Modify: `src/client/ui/appViewModel.ts`

- [ ] **Step 1: Write failing landing view-model tests**

```ts
it("shows room summaries on the landing screen with join enabled only for lobby rooms", () => {
  const model = createAppViewModel(
    createState({
      roomList: [
        { code: "ABCDE", hostNickname: "Host", playerCount: 2, phase: "lobby", mapId: DEFAULT_MAP_ID },
        { code: "FGHIJ", hostNickname: "Runner", playerCount: 4, phase: "playing", mapId: MAPS[1]!.id }
      ]
    })
  );

  expect(model.form.roomList).toHaveLength(2);
  expect(model.form.roomList[0]).toMatchObject({ canJoin: true });
  expect(model.form.roomList[1]).toMatchObject({ canJoin: false });
});
```

- [ ] **Step 2: Run the targeted client view-model test**

Run: `npm test -- tests/client/appFlow.test.ts`
Expected: FAIL because landing room-list fields do not exist yet.

- [ ] **Step 3: Extend client state with room-list storage**

```ts
roomList: RoomSummary[];
roomListLoading: boolean;
```

Add helpers:

```ts
export function updateRoomList(roomList: RoomSummary[]) { ... }
export function setRoomListLoading(loading: boolean) { ... }
```

- [ ] **Step 4: Extend the client view state and app view model**

Add landing-form room-list fields such as:

```ts
roomList: Array<{
  code: string;
  hostNickname: string;
  playerCountLabel: string;
  phaseLabel: string;
  mapName: string;
  canJoin: boolean;
}>;
roomListLoading: boolean;
hasRooms: boolean;
```

Map joinability from `room.phase === "lobby"`.

- [ ] **Step 5: Re-run the client flow tests**

Run: `npm test -- tests/client/appFlow.test.ts`
Expected: PASS.

### Task 3: Render the landing room list and wire refresh / join actions

**Files:**
- Modify: `src/client/net/clientSocket.ts`
- Modify: `src/client/app.ts`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Add failing DOM-structure regression checks if needed**

If you choose a source-based guard, extend `tests/client/appFlow.test.ts` with checks for:

```ts
expect(source).toContain("refresh-room-list");
expect(source).toContain("data-room-code");
```

- [ ] **Step 2: Extend the client socket wrapper**

```ts
requestRoomList() {
  socket.emit(CLIENT_EVENTS.requestRoomList);
}
```

Handle inbound list payloads:

```ts
socket.on(SERVER_EVENTS.roomList, ({ rooms }) => {
  updateRoomList(rooms);
  setRoomListLoading(false);
});
```

- [ ] **Step 3: Wire landing-page click handlers**

Add:

```ts
if (actionButton?.id === "refresh-room-list") {
  setRoomListLoading(true);
  clientSocket.requestRoomList();
  return;
}
```

For room-row join buttons:

```ts
const roomJoinButton = target.closest<HTMLElement>("[data-room-code]");
if (roomJoinButton?.dataset.roomCode) {
  if (!state.nicknameDraft.trim()) {
    focusInput(root, "#nickname");
    return;
  }

  updateRoomCodeDraft(roomJoinButton.dataset.roomCode);
  updateErrorMessage(null);
  clientSocket.joinRoom(roomJoinButton.dataset.roomCode, state.nicknameDraft.trim());
  return;
}
```

- [ ] **Step 4: Render the landing room-list panel**

Add a new panel under the existing action row:

```ts
<section class="room-list-panel">
  <div class="room-list-header">
    <div>
      <h3>Open rooms</h3>
      <p>Refresh to inspect current rooms before joining.</p>
    </div>
    <button id="refresh-room-list" class="ghost-button" type="button">Refresh</button>
  </div>
  <div class="room-list-body">
    <!-- rows or empty state -->
  </div>
</section>
```

Each row should include code, host, players, status, map, and a join button.

- [ ] **Step 5: Add matching CSS**

Add compact list styles using the existing visual language:

```css
.room-list-panel,
.room-list-row {
  border-radius: 22px;
  background: var(--bg-card-soft);
  border: 1px solid rgba(248, 250, 252, 0.08);
}
```

Make rows scan-friendly rather than card-heavy.

- [ ] **Step 6: Re-run client tests**

Run: `npm test -- tests/client/appFlow.test.ts tests/client/arenaScene.test.ts`
Expected: PASS.

### Task 4: Extend the formal browser flow to cover refresh and join-from-list

**Files:**
- Modify: `tests/e2e/roomFlow.spec.ts`

- [ ] **Step 1: Update the E2E spec to use the landing room list**

After the host creates a room, make the guest:

```ts
await guestPage.locator("#nickname").fill("Guest");
await guestPage.locator("#refresh-room-list").click();
await expect(guestPage.locator("[data-testid='room-list-row']")).toContainText(roomCode);
await guestPage.locator(`[data-room-code='${roomCode}']`).click();
```

- [ ] **Step 2: Run the E2E suite to observe the first failure**

Run: `npm run test:e2e`
Expected: FAIL until the landing room list is wired.

- [ ] **Step 3: Add any missing stable selectors**

Examples:

```ts
data-testid="room-list-row"
data-testid="room-list-empty"
```

- [ ] **Step 4: Re-run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS.

### Task 5: Final verification

**Files:**
- No code changes unless verification reveals defects

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run the formal E2E suite**

Run: `npm run test:e2e`
Expected: PASS.

## Test Plan

- `npm test -- tests/server/roomStore.test.ts`
- `npm test -- tests/client/appFlow.test.ts`
- `npm test -- tests/client/appFlow.test.ts tests/client/arenaScene.test.ts`
- `npm run test:e2e`
- `npm test`
- `npm run build`

## Assumptions

- Manual refresh is the intended UX; no polling or push invalidation is added.
- Room-list join buttons are enabled only for `lobby` rooms.
- Existing manual room-code join remains the fallback and is not removed.
