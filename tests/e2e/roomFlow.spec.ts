import { expect, test } from "@playwright/test";

function extractRoomCode(label: string | null) {
  const match = label?.match(/[A-Z0-9]{5}/);
  if (!match) {
    throw new Error(`Unable to extract room code from: ${label ?? "<empty>"}`);
  }

  return match[0];
}

test("room UI flow covers create, join, configure, start, leave, and re-entry", async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await hostPage.goto(baseURL!);
  await guestPage.goto(baseURL!);

  await hostPage.locator("#nickname").fill("Host");
  await hostPage.locator("#create-room").click();
  await expect(hostPage.locator("[data-testid='room-code']")).toBeVisible();

  const roomCode = extractRoomCode(await hostPage.locator("[data-testid='room-code']").textContent());

  await guestPage.locator("#nickname").fill("Guest");
  await guestPage.locator("#refresh-room-list").click();
  await expect(guestPage.locator("[data-testid='room-list-row']").filter({ hasText: roomCode })).toContainText(roomCode);
  await guestPage.locator(`[data-room-code='${roomCode}']`).click();

  await expect(guestPage.locator("[data-testid='room-code']")).toContainText(roomCode);
  await expect(hostPage.getByText("Guest", { exact: true })).toBeVisible();

  await hostPage.locator("[data-target-value='20']").click();
  await expect(hostPage.locator(".target-chip.is-selected")).toContainText("20");

  await hostPage.locator("[data-map-id='switchback']").click();
  await expect(hostPage.locator(".map-option.is-selected")).toContainText("Switchback");

  await hostPage.locator("#start-match").click();

  await expect(hostPage.locator("#game-root")).toBeVisible();
  await expect(guestPage.locator("#game-root")).toBeVisible();
  await expect(guestPage.locator("[data-testid='leave-room']")).toBeVisible();

  await guestPage.locator("[data-testid='leave-room']").click();

  await expect(guestPage.locator("#create-room")).toBeVisible();
  await expect(guestPage.locator("[data-testid='room-code']")).toHaveCount(0);

  await expect(hostPage.locator("[data-testid='player-count']")).toHaveText("1/6 players");
  await expect(hostPage.locator("#start-match")).toBeDisabled();

  await guestPage.goto(baseURL!);
  await guestPage.locator("#nickname").fill("Guest");
  await guestPage.locator("#refresh-room-list").click();
  await expect(guestPage.locator("[data-testid='room-list-row']").filter({ hasText: roomCode })).toContainText(roomCode);
  await guestPage.locator(`[data-room-code='${roomCode}']`).click();

  await expect(guestPage.locator("[data-testid='room-code']")).toContainText(roomCode);
  await expect(hostPage.locator("[data-testid='player-count']")).toHaveText("2/6 players");
  await expect(hostPage.getByText("Guest", { exact: true })).toBeVisible();

  await hostPage.locator("[data-testid='leave-room']").click();

  await expect(hostPage.locator("#create-room")).toBeVisible();
  await expect(guestPage.locator("[data-testid='player-count']")).toHaveText("1/6 players");

  await guestPage.locator("[data-testid='leave-room']").click();
  await expect(guestPage.locator("#create-room")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
