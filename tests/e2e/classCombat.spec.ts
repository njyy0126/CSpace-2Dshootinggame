import { expect, test, type Page } from "@playwright/test";

type LocalDebugState = {
  roomCode: string;
  localPlayerId: string;
  localPlayer: {
    x: number;
    y: number;
    ability: string | null;
    classType: string | null;
  };
  room: {
    activeProjectiles: Record<string, { id: string; ownerId: string }>;
    activeLasers: Record<
      string,
      {
        id: string;
        ownerId: string;
        path: Array<{ x: number; y: number }>;
        effect: string | null;
        damageApplied: boolean;
      }
    >;
    activeBombs: Record<
      string,
      {
        id: string;
        ownerId: string;
        target: { x: number; y: number };
        effect: string | null;
        state: "arming" | "exploding";
      }
    >;
    activePickups: Record<string, { id: string; type: string; x: number; y: number }>;
    players: Record<string, { id: string; classType?: string; health?: number }>;
  };
};

test("duplicate laser selection stays synced and laser shots keep their delayed locked path", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await hostPage.goto(baseURL!);
  await guestPage.goto(baseURL!);

  await hostPage.locator("#nickname").fill("Host");
  await hostPage.locator("#create-room").click();
  const roomCode = extractRoomCode(await hostPage.locator("[data-testid='room-code']").textContent());

  await guestPage.locator("#nickname").fill("Guest");
  await guestPage.locator("#refresh-room-list").click();
  await guestPage.locator(`[data-room-code='${roomCode}']`).click();

  await hostPage.locator("[data-class-type='laser-gunner']").click();
  await guestPage.locator("[data-class-type='laser-gunner']").click();

  await expect(hostPage.locator("[data-testid='class-label']")).toContainText("Laser Gunner");
  await expect(guestPage.locator("[data-testid='class-label']")).toContainText("Laser Gunner");
  await expect
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      return Object.values(state.room.players).map((player) => player.classType ?? "machine-gunner");
    })
    .toEqual(["laser-gunner", "laser-gunner"]);

  await hostPage.locator("#start-match").click();
  await expect(hostPage.locator("#game-root")).toBeVisible();
  await expect(guestPage.locator("#game-root")).toBeVisible();
  await expect(hostPage.locator("[data-testid='class-card']")).toContainText("Laser Gunner");

  await fireAtWorld(hostPage, 600, 120);

  await expect
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      const laser = Object.values(state.room.activeLasers)[0];
      if (!laser) {
        return null;
      }

      return {
        projectileCount: Object.keys(state.room.activeProjectiles).length,
        segmentCount: laser.path.length,
        endX: laser.path.at(-1)?.x ?? 0,
        effect: laser.effect,
        damageApplied: laser.damageApplied
      };
    })
    .toMatchObject({
      projectileCount: 0,
      segmentCount: 2,
      effect: null
    });

  await expect
    .poll(async () => observeActivatedLaser(hostPage))
    .toBe(true);

  await hostContext.close();
  await guestContext.close();
});

test("grenadier respects local throw range, then doubles it with green power-up and still explodes after 0.5 seconds", async ({
  browser,
  baseURL
}) => {
  test.setTimeout(180_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await hostPage.goto(baseURL!);
  await guestPage.goto(baseURL!);

  await hostPage.locator("#nickname").fill("Host");
  await hostPage.locator("#create-room").click();
  const roomCode = extractRoomCode(await hostPage.locator("[data-testid='room-code']").textContent());

  await guestPage.locator("#nickname").fill("Guest");
  await guestPage.locator("#refresh-room-list").click();
  await guestPage.locator(`[data-room-code='${roomCode}']`).click();

  await hostPage.locator("[data-class-type='grenadier']").click();
  await expect(hostPage.locator("[data-testid='class-label']")).toContainText("Grenadier");

  await hostPage.locator("#start-match").click();
  await expect(hostPage.locator("#game-root")).toBeVisible();
  await expect(hostPage.locator("[data-testid='class-card']")).toContainText("Grenadier");

  await fireAtWorld(hostPage, 600, 120);
  await expect.poll(async () => Object.keys((await getRoomDebugState(hostPage)).room.activeBombs).length).toBe(0);

  await fireAtWorld(hostPage, 300, 120);
  await expect
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      const bomb = Object.values(state.room.activeBombs)[0];
      return bomb ? { state: bomb.state, targetX: bomb.target.x, effect: bomb.effect } : null;
    })
    .toMatchObject({
      state: "arming",
      targetX: 300,
      effect: null
    });

  await waitForObservedBombState(hostPage, "exploding");

  await expect.poll(async () => Object.keys((await getRoomDebugState(hostPage)).room.activeBombs).length).toBe(0);

  const ricochetPickup = await waitForPickupType(hostPage, "ricochet", 12_000);
  await collectPickup(hostPage, ricochetPickup.id, ricochetPickup.type);
  await expect.poll(async () => (await getRoomDebugState(hostPage)).localPlayer.ability).toBe("ricochet");

  await fireAtWorld(hostPage, 500, 92);
  await expect
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      const bomb = Object.values(state.room.activeBombs)[0];
      return bomb ? { state: bomb.state, effect: bomb.effect, targetX: bomb.target.x, targetY: bomb.target.y } : null;
    })
    .toMatchObject({
      state: "arming",
      effect: "ricochet",
      targetX: 500,
      targetY: 92
    });

  await hostContext.close();
  await guestContext.close();
});

function extractRoomCode(label: string | null) {
  const match = label?.match(/[A-Z0-9]{5}/);
  if (!match) {
    throw new Error(`Unable to extract room code from: ${label ?? "<empty>"}`);
  }

  return match[0];
}

async function getRoomDebugState(page: Page): Promise<LocalDebugState> {
  const state = await page.evaluate(() => {
    const debugState = (window as any).__FPS_DEBUG__?.getClientState?.();
    if (!debugState?.room || !debugState?.localPlayerId) {
      return null;
    }

    const localPlayer = debugState.room.players[debugState.localPlayerId];
    return {
      roomCode: debugState.room.code,
      localPlayerId: debugState.localPlayerId,
      localPlayer: {
        x: localPlayer.x,
        y: localPlayer.y,
        ability: localPlayer.ability,
        classType: localPlayer.classType ?? null
      },
      room: {
        activeProjectiles: debugState.room.activeProjectiles,
        activeLasers: debugState.room.activeLasers ?? {},
        activeBombs: debugState.room.activeBombs ?? {},
        activePickups: debugState.room.activePickups,
        players: debugState.room.players
      }
    };
  });

  if (!state) {
    throw new Error("Debug state is not ready");
  }

  return state;
}

async function fireAtWorld(page: Page, aimX: number, aimY: number) {
  await holdInput(page, {
    moveX: 0,
    moveY: 0,
    aimX,
    aimY,
    firing: true
  }, 120);
  await sendInput(page, {
    moveX: 0,
    moveY: 0,
    aimX,
    aimY,
    firing: false
  });
}

async function sendInput(
  page: Page,
  input: {
    moveX: number;
    moveY: number;
    aimX: number;
    aimY: number;
    firing: boolean;
  }
) {
  const sent = await page.evaluate((payload) => {
    return (window as any).__FPS_DEBUG__?.sendInput?.(payload) ?? false;
  }, input);

  if (!sent) {
    throw new Error("Debug input bridge is not ready");
  }
}

async function holdInput(
  page: Page,
  input: {
    moveX: number;
    moveY: number;
    aimX: number;
    aimY: number;
    firing: boolean;
  },
  durationMs: number,
  intervalMs = 20
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    await sendInput(page, input);
    await page.waitForTimeout(intervalMs);
  }
}

async function observeActivatedLaser(page: Page, timeoutMs = 1_000, intervalMs = 40) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await getRoomDebugState(page);
    if (Object.values(state.room.activeLasers).some((laser) => laser.damageApplied)) {
      return true;
    }

    await page.waitForTimeout(intervalMs);
  }

  return false;
}

async function waitForObservedBombState(
  page: Page,
  desiredState: LocalDebugState["room"]["activeBombs"][string]["state"],
  timeoutMs = 1_500,
  intervalMs = 40
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await getRoomDebugState(page);
    const bomb = Object.values(state.room.activeBombs)[0];

    if (bomb?.state === desiredState) {
      return;
    }

    await page.waitForTimeout(intervalMs);
  }

  throw new Error(`Timed out waiting to observe bomb state "${desiredState}"`);
}

async function waitForPickupType(page: Page, pickupType: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await getRoomDebugState(page);
    const pickup = Object.values(state.room.activePickups).find((candidate) => candidate.type === pickupType) ?? null;
    if (pickup) {
      return pickup;
    }

    await page.waitForTimeout(120);
  }

  throw new Error(`Timed out waiting for pickup type "${pickupType}"`);
}

async function collectPickup(page: Page, pickupId: string, pickupType: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await getRoomDebugState(page);
    if (state.localPlayer.ability === pickupType) {
      return;
    }

    const pickup = Object.values(state.room.activePickups).find((candidate) => candidate.id === pickupId) ?? null;
    if (!pickup) {
      await page.waitForTimeout(100);
      continue;
    }

    const deltaX = pickup.x - state.localPlayer.x;
    const deltaY = pickup.y - state.localPlayer.y;
    if (Math.hypot(deltaX, deltaY) <= 18) {
      await sendInput(page, {
        moveX: 0,
        moveY: 0,
        aimX: pickup.x,
        aimY: pickup.y,
        firing: false
      });
      await page.waitForTimeout(120);
      continue;
    }

    await holdInput(page, {
      moveX: Math.abs(deltaX) <= 8 ? 0 : Math.sign(deltaX),
      moveY: Math.abs(deltaY) <= 8 ? 0 : Math.sign(deltaY),
      aimX: pickup.x,
      aimY: pickup.y,
      firing: false
    }, 90);
  }

  throw new Error(`Timed out collecting pickup "${pickupType}"`);
}
