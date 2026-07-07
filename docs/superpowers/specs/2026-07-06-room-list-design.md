# Landing Room List Design

## Summary

This change adds a room list to the landing page under the nickname and room-code inputs. The list shows currently created rooms visible on the local network session, along with a manual refresh button and a join action for rooms that are currently joinable.

The implementation should reuse the existing in-memory room store as the source of truth, expose only a safe room-summary shape over Socket.IO, and keep the landing-page UI in the same DOM/CSS style as the current lobby shell.

## Goals

- Show currently created rooms on the landing page.
- Let users inspect room code, host, player count, room state, and selected map before joining.
- Provide a manual refresh action rather than automatic live updates.
- Let users join directly from the list when the room is in `lobby`.

## Non-Goals

- No public matchmaking.
- No pagination, filtering, or sorting controls beyond a sensible default order.
- No automatic polling or push-based room-list refresh.
- No exposure of full room snapshots, player positions, or input state to landing clients.

## Product Behavior

### Landing Page Layout

Under the existing nickname / room-code form block, add a room list panel with:

- a heading
- a short explanatory line
- a `Refresh` button
- a list of room rows

Each room row shows:

- room code
- host nickname
- player count
- room status
- selected map
- join button

### Join Button Rules

- `Lobby`: join button enabled
- `Playing`: join button disabled
- `Celebration`: join button disabled

The user explicitly requested that these rooms should still be visible even when they are not joinable.

### Manual Refresh

- The landing page includes a visible refresh button.
- Clicking it sends a room-list request to the server.
- The server responds with the current room list snapshot.
- No background auto-refresh is performed.

### Direct Join From List

When the user clicks `Join` from a room row:

- if nickname is empty, focus the nickname input and do not send a request
- otherwise, populate the room-code draft with that room code
- send the existing join-room request using the current nickname

This keeps list-based join behavior consistent with manual room-code join.

## Technical Design

### Shared Types

Add a shared room-summary type with the minimum fields needed by the landing list:

- `code`
- `hostNickname`
- `playerCount`
- `phase`
- `mapId`

This should live in shared types so server, client socket handlers, and view-model code all use one contract.

### Socket Contract

Add:

- `client:request-room-list`
- `server:room-list`

The server response payload should be an array of room-summary items. This should be separate from `server:room-state`, because the landing page does not need full room snapshots.

### Server Data Source

The in-memory room store already contains the authoritative room map. Add a `listRoomSummaries()` helper that derives safe summaries from that state:

- host nickname should come from `room.players[room.hostId]`
- player count should be `Object.keys(room.players).length`
- map should be the room's current `mapId`
- phase should be the room's current phase

No private gameplay state should be exposed here.

### Client State

Extend client state with:

- `roomList`
- `roomListLoading`

These values are only used by the landing page.

### View Model

Extend the landing-page part of the app view model so rendering does not contain business rules directly. The view model should prepare:

- visible room rows
- human-readable phase labels
- map names
- whether the refresh button is disabled
- whether each join button is enabled
- empty-state text when no rooms are available

### UI Styling

The room-list panel should visually match the existing landing shell:

- same background treatment as other cards/panels
- compact rows built for scanning
- no extra decorative layout changes

The list belongs in the current blank area under the form, not in a new sidebar or separate screen.

## Testing Strategy

### Server Tests

- verify room summaries include host nickname, count, phase, and map
- verify multiple rooms are listed safely without full snapshot leakage

### Client View-Model Tests

- verify landing model includes room-list entries
- verify `Lobby` rows are joinable
- verify `Playing` and `Celebration` rows are visible but not joinable

### Browser E2E

Extend the formal Playwright flow so a second client can:

- refresh the landing room list
- see the host-created room
- join from the room list instead of only via manual code input

## Risks and Mitigations

- Risk: room list and join permissions diverge.
  - Mitigation: derive joinability directly from `phase === "lobby"` in the same shared/view-model flow used for rendering.

- Risk: landing page becomes noisy.
  - Mitigation: keep the panel compact and reuse the existing card styling language.

- Risk: stale room list after room changes.
  - Mitigation: user explicitly requested a refresh button; the design uses manual refresh by choice.

## Acceptance Criteria

- Landing page shows a room list below the nickname and room-code controls.
- List rows show room code, host nickname, player count, room status, and selected map.
- A refresh button requests the latest room list from the server.
- `Lobby` rooms can be joined from the list.
- `Playing` and `Celebration` rooms remain visible but have disabled join buttons.
- Existing manual room-code join behavior continues to work.
