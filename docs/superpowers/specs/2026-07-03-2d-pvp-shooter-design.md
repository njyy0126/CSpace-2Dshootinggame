# Browser Multiplayer 2D PvP Shooter Design

## Summary

This project is a browser-deployable 2D top-down multiplayer shooter for desktop browsers. It supports 2-6 players per room, uses no database, and must run comfortably on Render's 512 MB free instance. The game is a room-code-based PvP deathmatch with simple geometric visuals, one fixed arena map, one automatic weapon, and a strong emphasis on dodging, movement, and line control instead of sustained face-to-face trading.

The recommended implementation stack is:

- Frontend: Phaser 3
- Backend: Node.js + Socket.IO
- Hosting: single Render web service serving both static client assets and realtime room gameplay

## Product Goals

- Make it easy for friends to open a URL, enter a nickname, create or join a room, and start playing quickly.
- Prioritize stable multiplayer feel and readable combat over content breadth.
- Keep the server lightweight enough for Render free-tier limits.
- Avoid any persistent systems such as accounts, progression, or database-backed rooms.

## Core Experience

### Match Structure

- Room-based PvP for 2-6 players.
- Players create a room or join via room code.
- One player is the host.
- The host chooses the kill target: 10, 20, or 30.
- One player may enter the room and move around the map before the match begins.
- A match should only be started manually by the host.
- At least 2 players are required for a meaningful match start.

### Round Flow

1. Player opens the site and enters a nickname.
2. Player creates a room or joins by room code.
3. In the room lobby, players see the room code, player list, host marker, and selected kill target.
4. The host starts the match.
5. Eligible players spawn into the arena.
6. Match runs as an infinite-respawn deathmatch until a player reaches the kill target.
7. The winner triggers a 5-second celebration phase.
8. During celebration, the winner alone receives a temporary wall-destroying area weapon.
9. Celebration weapon can destroy normal walls but cannot destroy map boundaries.
10. After 5 seconds, the game returns to the lobby and the map resets fully.

### Mid-Match Joins

- New players may join while a match is in progress.
- Mid-match joiners remain in a waiting/spectator state.
- They do not spawn into the active round.
- They become eligible to spawn at the next round start.

## Gameplay Rules

### Player Controls

- Desktop browser only.
- `WASD` for movement.
- Mouse aim.
- Hold mouse button for automatic fire.

### Combat Model

- Each player has 4 health.
- Each bullet deals 1 damage.
- 4 hits kills a player.
- No automatic healing.
- Full health is restored only on respawn.
- Players can pass through each other.
- No pickups in v1.
- No reloads.
- Infinite ammunition.
- Weapon fire rate is capped by game rules, not by click speed.

### Weapon Behavior

- One base automatic weapon for all players.
- Bullets are visible projectiles, not hitscan.
- Bullets disappear on contact with normal walls or map boundaries.
- Getting hit only reduces health; no slow, stun, or hit-stop effects in v1.

### Death, Respawn, and Invulnerability

- On death, the player waits 2 seconds before respawning.
- After respawn, the player has 2 seconds of invulnerability.
- Respawn selection should prefer spawn points farthest from living enemies.
- If all spawn choices are imperfect, post-respawn invulnerability acts as the fairness buffer.

### Celebration Phase

- Triggered immediately when a player reaches the room kill target.
- Normal scoring stops during celebration.
- Winner receives a temporary area weapon.
- Temporary weapon destroys only destructible interior walls.
- Map boundary walls are always indestructible.
- Destroyed walls exist only for the 5-second celebration phase.
- Entire map resets before returning to lobby state.

## Arena and Camera

### Map

- One fixed small arena map in v1.
- Entire map is visible on one screen at all times.
- Arena includes solid walls and cover pieces.
- Arena edges are hard boundaries and cannot be destroyed.

### Visual Style

- Minimal geometric visual style.
- Use simple readable character shapes and color coding.
- Prioritize clarity of bullets, walls, cover, player orientation, health state, invulnerability state, and winner celebration state.

## Networking and Authority

### Architecture

- Use a lightweight Node.js authoritative game server.
- Use Socket.IO for room membership and realtime updates.
- Serve the built frontend from the same Node process to minimize deployment complexity.

### Authority Model

- Server is authoritative for:
  - room membership
  - host permissions
  - match start and end
  - player lifecycle
  - projectile simulation
  - collision checks
  - damage, kills, and score
  - respawn timing
  - invulnerability timing
  - celebration phase rules
  - destructible wall state during celebration

- Client is responsible for:
  - local input capture
  - immediate local feedback for player movement and firing
  - rendering map, players, bullets, HUD, and game state
  - smoothing remote players and bullet motion between server updates

### Sync Feel

- Do not implement a heavy rollback model in v1.
- Use a practical hybrid:
  - immediate local response for own movement and fire feedback
  - server correction for authoritative state
  - interpolation for remote players and projectiles

This keeps the game responsive enough for small-room PvP while staying simple and affordable within free-tier hosting limits.

## UI and Screens

### Entry Screen

- Nickname input
- Create room action
- Join room by code action
- Small desktop-controls hint

### Lobby Screen

- Room code
- Player list
- Host marker
- Player count out of 6
- Host-only kill target selector: 10 / 20 / 30
- Start match button for host
- Clear status for:
  - waiting for more players
  - in-lobby free movement/testing allowed
  - match in progress
  - joined mid-match, waiting for next round

### Match Screen

- Full-map arena as the main focus
- Minimal HUD only
- No cluttered menus during active play

### HUD

- Player nickname
- 4-point health display
- Personal kill count
- Match target kill count
- Room scoreboard
- Respawn countdown
- Invulnerability indicator
- Celebration countdown

## Performance and Hosting Constraints

### Render Free-Tier Constraints

- Must fit comfortably within a 512 MB instance.
- No database.
- No large art pipeline or heavy asset bundles.
- Keep room state in memory only.
- Keep server-side simulation intentionally small and bounded.

### Practical Limits

- Max 6 players per room.
- Limit active projectile counts to prevent runaway load.
- Limit room creation and stale-room retention in memory.
- Use simple geometry and lightweight collisions.
- Avoid unnecessary third-party services.
- Accept that instance sleep/restart clears active rooms.

## Non-Goals for v1

- Mobile browser support
- Accounts or persistence
- Matchmaking or public auto-join
- Multiple weapons
- Reloading or ammo economy
- Pickups or buffs
- Multiple maps
- Character abilities, dash, or roll
- Destructible walls during normal play
- Database-backed stats or history

## Technical Direction

### Suggested Project Shape

- A single Node service containing:
  - static hosting for the built client
  - Socket.IO multiplayer server
  - in-memory room and match state

- Frontend responsibilities:
  - Phaser scenes for entry, lobby, and match presentation
  - local input handling
  - client-side interpolation and feedback

- Backend responsibilities:
  - room lifecycle
  - player connection lifecycle
  - authoritative match state machine
  - projectile and collision simulation
  - scoring, respawn, invulnerability, and celebration resolution

## Open Values Chosen Explicitly

These defaults were chosen to remove ambiguity for implementation:

- Multiplayer mode: room-code PvP deathmatch
- Match entry: host starts manually
- Join-in-progress: allowed, but waits until next round
- Camera: entire map visible at once
- Interaction between players: no body collision
- Health model: fixed 4 health, no healing
- Weapon model: single automatic projectile weapon, infinite ammo, no reload
- Post-win behavior: 5-second winner-only destruction celebration, then lobby reset
- Platform target: desktop browsers only
- Hosting target: one lightweight Render service

## Acceptance Criteria

- A player can enter a nickname, create a room, and see a room code.
- A second player can join by room code from another browser session.
- The host can choose 10, 20, or 30 kills and start the match.
- Players can move with `WASD`, aim with mouse, and hold fire for capped automatic shooting.
- Visible bullets move across the arena and disappear on walls.
- Players die after 4 hits.
- Dead players respawn after 2 seconds with 2 seconds of invulnerability.
- Match ends when a player reaches the kill target.
- Winner gets a 5-second celebration phase with destructible non-boundary walls.
- After celebration, the room returns to the lobby and the map is reset.
- A player joining during an active match is held for the next round instead of spawning immediately.
- The app can be deployed as a single Render web service without any database dependency.
