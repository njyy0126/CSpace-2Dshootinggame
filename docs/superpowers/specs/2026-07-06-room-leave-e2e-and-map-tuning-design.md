# Room Leave, Formal E2E, and Map Tuning Design

## Summary

This design extends the current multiplayer room flow with three tightly related improvements:

1. Add a real user-facing "leave room" action that works both in the lobby and during an active match.
2. Add a more formal end-to-end automation layer that exercises the full room UI flow through a real browser.
3. Slightly reduce selected obstacle sizes across the three shipped maps so intended travel gaps are actually traversable.

The recommended approach is to keep the current room and match architecture intact, extend the existing Socket.IO room lifecycle instead of inventing a second state model, and formalize browser automation around the UI that already exists.

## Goals

- Let any player leave a room intentionally without closing the tab.
- Support leaving during active play without corrupting room state or keeping stale socket membership.
- Make future multiplayer-state changes safer by codifying the full room UI path in automated browser coverage.
- Preserve the topology and identity of the three existing maps while widening practical traversal through narrow lanes.

## Non-Goals

- No hot-swapping of the broader room architecture.
- No spectator mode, reconnect flow, or persistent user profiles.
- No large-scale rework of map layouts, spawn systems, or collision math.
- No redesign of the current HUD visual language beyond adding the leave-room control.

## Product Behavior

### Leave Room Entry Points

- In the lobby, the room UI should expose a visible leave-room button alongside the existing room controls.
- During a match, the game UI should also expose a leave-room button inside the right-side HUD / scoreboard region.
- The button must not cover the map or steal the main pointer area used for aiming and firing.

### Leave Room Behavior

When a player leaves:

- The client emits an explicit leave-room event for the current room.
- The server removes that socket from all room-owned state for the room being left, including:
  - player roster
  - player input state
  - room host ownership if the host left
  - Socket.IO room membership
- The server broadcasts the updated room snapshot to the remaining players in that room.
- The leaving client returns to the landing screen and keeps the nickname draft for quick re-entry.
- The leaving client must stop behaving like it is still inside the room:
  - no stale room snapshot
  - no stale current room code for later input packets
  - no continued gameplay input against the old room

### Match-Side Leave Safety

Leaving during an active match should reuse the same safety rule the project already applies when too few eligible players remain:

- if a departure causes the room to fall below the minimum active-player condition, the room returns to the lobby and resets the round state safely
- remaining players must not inherit stale projectiles, stale inputs, or stale host references

This keeps match-leave handling aligned with the existing room-store rules instead of creating a second edge-case branch.

## Technical Design

### Shared Message Contract

The existing `client:leave-room` event constant should be completed into a working contract:

- client sends `{ roomCode }`
- server validates room existence and membership
- server acknowledges the state transition indirectly through the next room-state emission and the client’s local reset

No new server event is required if the client can safely reset itself after emitting and after the server side leaves the Socket.IO room. A dedicated success event is optional but not necessary for this change.

### Server Room Lifecycle

The room store already centralizes player membership cleanup. The leave-room path should route through that same authority instead of duplicating cleanup logic in the socket handler.

Recommended store behavior:

- add an explicit room-scoped leave helper such as `leaveRoom(roomCode, socketId)` or equivalent
- remove the player from the target room only
- clean player inputs at the same time as player removal
- if the host leaves, assign the next remaining player as host
- if no players remain, delete the room
- if the room is playing and eligible-player count drops too low, return to lobby via the existing safe reset path

The disconnect path should continue to use full cleanup across all rooms for defense in depth, while explicit leave should target one room and then remove the socket from the matching Socket.IO room.

### Client State Flow

The client already stores:

- room snapshot
- local player id
- nickname draft
- room-code draft
- connection readiness
- error message

The leave-room action should:

- emit the leave event using the active room code
- clear the local room snapshot immediately after the leave action is accepted locally, or when the socket handler finalizes the leave path
- preserve nickname draft
- clear stale error state

The game scene should naturally unmount once room state becomes `null` because the app already gates the game surface by screen.

### UI Placement

Lobby:

- add a leave-room button near the existing primary room controls
- keep it visually secondary to the start button

In-game:

- place the leave-room button in the right sidebar, above or below the scoreboard/HUD stack
- keep the button outside the `.game-root` and `.playfield-shell` pointer area

This avoids click interception or pointer-coordinate drift in the map canvas.

## End-to-End Automation Design

### Why Add a Formal E2E Layer

The current logic tests and ad hoc browser checks are valuable but do not fully lock down the real UI flow. The new automation should serve as a durable regression harness for future room-state changes.

### Scope

The formal browser automation should cover:

1. Player A creates a room.
2. Player B joins using the room code shown in the UI.
3. Host changes match target.
4. Host changes map.
5. Host starts a match.
6. A player leaves during the match through the real UI button.
7. Remaining player state updates correctly.
8. A player can return to the landing flow and create or join again.
9. A completed round can return to the lobby and start again.

### Form

The recommended implementation is a repository-owned browser E2E suite that launches the app, opens two real browser contexts or pages, and drives the existing DOM selectors rather than synthetic room-store-only helpers.

The suite should run through a script so future verification is one command, not a manual agent-browser session.

### Relationship to Existing Tests

- Vitest remains the primary guard for server rules, map data, and client view-model expectations.
- The new E2E suite guards integration between:
  - rendered UI
  - socket events
  - room transitions
  - multi-player browser flows

## Map Tuning Design

### Intent

The three maps already differ structurally. The problem is not that the layouts are wrong; it is that several gaps feel like valid movement channels but are slightly too tight in practice. The safest adjustment is to shrink selected cover pieces modestly instead of changing overall path topology.

### Adjustment Rules

- Do not change arena boundaries.
- Do not move spawn points unless a tuned obstacle proves to intersect or unfairly pressure them.
- Prefer shrinking widths and heights of interior `cover` walls over relocating them.
- Keep mirrored maps visually and tactically mirrored after tuning.
- Re-run spawn safety and collision-alignment checks after every change.

### Per-Map Direction

`crossroads`

- Slightly reduce the footprint of central plaza blocks and side bridge pieces so the central contest area keeps its identity but gains cleaner slip lanes.

`switchback`

- Slightly narrow the tall zig-zag pillars and bridge segments so the intended mirrored corridors and flank cuts become reliably traversable.

`citadel`

- Slightly reduce the keep-adjacent gate pieces, side-lane blockers, and buttress pressure points so ring routes remain meaningful without creating dead-feeling choke seams.

## Testing Strategy

### Server / Logic Tests

- add room-store regression coverage for explicit leave-room behavior
- verify host reassignment on leave
- verify in-match leave returns to lobby when active-player count becomes insufficient
- verify player input state is removed on leave

### Client / View Tests

- verify lobby and in-game view models expose leave-room controls as expected
- verify screen state returns to landing after room reset on the client side

### Shared Map Tests

- keep spawn safety checks
- add or tighten traversal-oriented assertions where practical for tuned gap widths

### Browser E2E

- codify the full room UI lifecycle with real browser actions and two players
- include the new in-match leave-room interaction

## Risks and Mitigations

- Risk: leaving during play could leave the client still emitting old inputs.
  - Mitigation: clear local room state immediately and rely on existing screen-gated game teardown.

- Risk: host leaving could create inconsistent control ownership.
  - Mitigation: keep host reassignment inside the room store, not the UI.

- Risk: shrinking cover too much could make maps too open.
  - Mitigation: make only small dimension changes and keep topology intact.

- Risk: E2E automation could become flaky if it relies on arbitrary sleeps.
  - Mitigation: wait on visible UI conditions and socket-driven state changes instead of fixed delays wherever possible.

## Acceptance Criteria

- A player can leave the room from the lobby with a dedicated UI control.
- A player can leave the room during a live match with a dedicated UI control.
- Leaving clears room membership, inputs, host assignment, and room snapshot state correctly.
- Leaving during a match does not leave ghost players or stale gameplay state behind.
- A formal E2E suite exists in the repository and covers the main room UI lifecycle end to end.
- The three maps retain their distinct structure while key narrow lanes become more traversable.
