# Player Sprite Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated circle player marker with a transparent playable operator sprite and wire it into the Phaser boot flow.

**Architecture:** Keep gameplay rules and collision untouched, but move player visuals from procedural circle generation to a shipped image asset loaded during boot. Preserve the existing generated bullet and wall textures, and add a small client test that locks the new asset path into place.

**Tech Stack:** Phaser 3, Vite static asset serving via `public/`, Vitest source-level regression tests, local Python/Pillow asset export.

---

### Task 1: Export Transparent Player Sprites

**Files:**
- Modify: `tmp/imagegen/render_arrowhead_variants.py`
- Create: `public/assets/players/arrowhead-core-cyan.png`
- Create: `public/assets/players/arrowhead-brace-amber.png`
- Create: `public/assets/players/arrowhead-sprint-magenta.png`

- [ ] **Step 1: Update the local renderer to write cropped transparent sprite outputs into `public/assets/players/`**

Add a transparent export path alongside the green-background preview export so the same rendered source produces both exploration sheets and in-game sprite files.

- [ ] **Step 2: Run the exporter and verify it writes all three sprite files**

Run: `python tmp\imagegen\render_arrowhead_variants.py`
Expected: it prints three `output\imagegen\arrowhead-family\...` paths and three matching `public\assets\players\...` paths.

### Task 2: Load the Selected Sprite in Boot and Resize It for Arena Readability

**Files:**
- Modify: `src/client/game/scenes/BootScene.ts`
- Modify: `src/client/game/scenes/ArenaScene.ts`

- [ ] **Step 1: Replace procedural player texture generation with a boot-time image load**

Load `/assets/players/arrowhead-core-cyan.png` in `preload()` and stop generating the white player circle in `create()`. Keep bullet and wall texture generation exactly as procedural graphics.

- [ ] **Step 2: Update arena display sizing for the sprite silhouette**

Increase the player image display size and adjust label / invulnerability ring offsets so the new operator silhouette reads clearly without changing collision rules.

- [ ] **Step 3: Run the client test slice and confirm the visual contract still matches source**

Run: `npm test -- --run tests/client/bootScene.test.ts tests/client/arenaScene.test.ts`
Expected: PASS

### Task 3: Add Regression Coverage and Final Verification

**Files:**
- Create: `tests/client/bootScene.test.ts`

- [ ] **Step 1: Add a Vitest source regression for the new asset load**

Assert that `BootScene` contains a `preload()` method, loads the new player sprite path, and no longer contains the old `fillCircle(14, 14, 14)` player texture generation.

- [ ] **Step 2: Run the broader verification commands**

Run: `npm test -- --run tests/client/bootScene.test.ts tests/client/arenaScene.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS and emits the updated client bundle to `dist/client`

- [ ] **Step 3: Start the local app if needed for manual inspection**

Run: `npm run dev`
Expected: local client/server dev stack starts and the game shows the operator sprite instead of the circle marker.

### Task 4: Rotate the Sprite to Follow Aim Direction

**Files:**
- Modify: `src/client/game/scenes/ArenaScene.ts`
- Modify: `tests/client/arenaScene.test.ts`

- [ ] **Step 1: Write the failing source-level regression for aim-based rotation**

Assert that `ArenaScene` defines a sprite aim rotation offset, derives an angle from `player.aim` with `Math.atan2`, and applies that angle through `body.setRotation(...)` instead of leaving the sprite fixed.

- [ ] **Step 2: Run the rotation test to verify it fails before implementation**

Run: `npm test -- --run tests/client/arenaScene.test.ts`
Expected: FAIL because the scene does not yet rotate the sprite from `player.aim`

- [ ] **Step 3: Implement minimal aim-follow rotation in the player sync path**

Keep the existing display-size logic, but add a constant offset for the sprite art and apply `body.setRotation(aimAngle + offset)` during `syncPlayers()`.

- [ ] **Step 4: Re-run tests and production build**

Run: `npm test -- --run tests/client/bootScene.test.ts tests/client/arenaScene.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS
