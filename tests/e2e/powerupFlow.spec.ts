import { expect, test, type Page } from "@playwright/test";

type LocalPlayerState = {
  id: string;
  x: number;
  y: number;
  ability: string | null;
};

type RoomDebugState = {
  localPlayer: LocalPlayerState;
  room: {
    activeProjectiles: Record<
      string,
      {
        id: string;
        ownerId: string;
        radius: number;
        effect: string | null;
      }
    >;
    activePickups: Record<
      string,
      {
        id: string;
        type: string;
        x: number;
        y: number;
      }
    >;
  };
};

test("power-up flow exposes field drops, grants and overwrites abilities, and keeps gunner fire alive", async ({
  browser,
  baseURL
}) => {
  test.setTimeout(120_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await hostPage.goto(baseURL!);
  await guestPage.goto(baseURL!);

  await hostPage.locator("#nickname").fill("Host");
  await hostPage.locator("#create-room").click();
  const roomCodeLabel = hostPage.locator("[data-testid='room-code']");
  await expect(roomCodeLabel).toBeVisible();
  const roomCode = (await roomCodeLabel.textContent())?.match(/[A-Z0-9]{5}/)?.[0];
  if (!roomCode) {
    throw new Error("Unable to determine room code");
  }

  await guestPage.locator("#nickname").fill("Guest");
  await guestPage.locator("#refresh-room-list").click();
  await guestPage.locator(`[data-room-code='${roomCode}']`).click();

  await hostPage.locator("#start-match").click();
  await expect(hostPage.locator("#game-root")).toBeVisible();
  await expect(guestPage.locator("#game-root")).toBeVisible();

  const firstPickup = await waitForNextPickup(hostPage);
  await expect(hostPage.locator("[data-testid='field-pickup-card']")).toHaveAttribute("data-pickup-type", firstPickup.type);
  await collectPickup(hostPage, firstPickup.id, firstPickup.type);
  await expect(hostPage.locator("[data-testid='active-ability-card']")).toHaveAttribute("data-ability-type", firstPickup.type);

  const secondPickup = await waitForNextPickup(hostPage, firstPickup.id);
  await collectPickup(hostPage, secondPickup.id, secondPickup.type);
  await expect(hostPage.locator("[data-testid='active-ability-card']")).toHaveAttribute("data-ability-type", secondPickup.type);

  const abilityType = (await getRoomDebugState(hostPage)).localPlayer.ability;
  if (!abilityType) {
    throw new Error("Expected the local player to hold a picked-up ability");
  }

  if (abilityType === "rapid-fire") {
    await holdInput(hostPage, {
      moveX: 0,
      moveY: 0,
      aimX: 600,
      aimY: 120,
      firing: true
    }, 260);
    await expect.poll(async () => countOwnedProjectiles(hostPage)).toBeGreaterThanOrEqual(2);
    await sendInput(hostPage, {
      moveX: 0,
      moveY: 0,
      aimX: 600,
      aimY: 120,
      firing: false
    });
  } else {
    await fireAtWorld(hostPage, 600, 120);
    await expect.poll(async () => countOwnedProjectiles(hostPage)).toBeGreaterThan(0);

    if (abilityType === "heavy-shot") {
      await expect
        .poll(async () => {
          const state = await getRoomDebugState(hostPage);
          return Math.max(
            0,
            ...Object.values(state.room.activeProjectiles)
              .filter((projectile) => projectile.ownerId === state.localPlayer.id)
              .map((projectile) => projectile.radius)
          );
        })
        .toBeGreaterThan(4);
    }

    if (abilityType === "ricochet") {
      await expect
        .poll(async () => {
          const state = await getRoomDebugState(hostPage);
          return Object.values(state.room.activeProjectiles).find(
            (projectile) => projectile.ownerId === state.localPlayer.id
          )?.effect ?? null;
        })
        .toBe("ricochet");
    }
  }

  await hostContext.close();
  await guestContext.close();
});

async function getRoomDebugState(page: Page): Promise<RoomDebugState> {
  const state = await page.evaluate(() => {
    const debugState = (window as any).__FPS_DEBUG__?.getClientState?.();
    if (!debugState?.room || !debugState?.localPlayerId) {
      return null;
    }

    const localPlayer = debugState.room.players[debugState.localPlayerId];
    return {
      localPlayer: {
        id: localPlayer.id,
        x: localPlayer.x,
        y: localPlayer.y,
        ability: localPlayer.ability
      },
      room: {
        activeProjectiles: debugState.room.activeProjectiles,
        activePickups: debugState.room.activePickups
      }
    };
  });

  if (!state) {
    throw new Error("Debug state is not ready");
  }

  return state;
}

async function waitForNextPickup(page: Page, previousId?: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const state = await getRoomDebugState(page);
    const pickup = Object.values(state.room.activePickups)[0] ?? null;
    if (pickup && pickup.id !== previousId) {
      return pickup;
    }

    await page.waitForTimeout(120);
  }

  throw new Error("Timed out waiting for the next field pickup");
}

async function countOwnedProjectiles(page: Page) {
  const state = await getRoomDebugState(page);
  return Object.values(state.room.activeProjectiles).filter((projectile) => projectile.ownerId === state.localPlayer.id)
    .length;
}

async function fireAtWorld(page: Page, aimX: number, aimY: number) {
  await holdInput(page, {
    moveX: 0,
    moveY: 0,
    aimX,
    aimY,
    firing: true
  }, 100);
  await sendInput(page, {
    moveX: 0,
    moveY: 0,
    aimX,
    aimY,
    firing: false
  });
}

async function moveToCurrentPickup(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await getRoomDebugState(page);
    const pickup = Object.values(state.room.activePickups)[0];
    if (!pickup) {
      await page.waitForTimeout(100);
      continue;
    }

    if (state.localPlayer.ability === pickup.type) {
      return;
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
}

async function collectPickup(page: Page, pickupId: string, pickupType: string) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const state = await getRoomDebugState(page);
    if (state.localPlayer.ability === pickupType) {
      return;
    }

    const pickup = Object.values(state.room.activePickups).find((candidate) => candidate.id === pickupId) ?? null;
    if (!pickup) {
      await page.waitForTimeout(120);
      continue;
    }

    await moveToCurrentPickup(page);
    await page.waitForTimeout(120);
  }

  throw new Error(`Timed out collecting pickup ${pickupType}`);
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
