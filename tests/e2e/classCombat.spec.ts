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
    players: Record<string, { id: string; classType?: string }>;
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
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      const laser = Object.values(state.room.activeLasers)[0];
      return laser ? laser.damageApplied : null;
    })
    .toBe(true);

  await hostContext.close();
  await guestContext.close();
});

test("grenadier respects local throw range and explodes after 0.5 seconds", async ({
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

  await expect
    .poll(async () => {
      const state = await getRoomDebugState(hostPage);
      const bomb = Object.values(state.room.activeBombs)[0];
      return bomb?.state ?? null;
    })
    .toBe("exploding");

  await expect.poll(async () => Object.keys((await getRoomDebugState(hostPage)).room.activeBombs).length).toBe(0);

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
