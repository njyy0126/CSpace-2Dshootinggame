import { describe, expect, it } from "vitest";
import { applyInputPayloadToRoom } from "../../src/server/socket/registerHandlers";
import { createRoomState } from "../../src/server/game/state";

describe("server input handling", () => {
  it("keeps a queued shot after a quick press and release before the next tick", () => {
    const room = createRoomState("ABCDE", "host", "Host");

    applyInputPayloadToRoom(
      room,
      "host",
      {
        roomCode: room.code,
        moveX: 0,
        moveY: 0,
        aimX: room.players.host.x + 200,
        aimY: room.players.host.y,
        firing: true
      },
      10_000
    );
    applyInputPayloadToRoom(
      room,
      "host",
      {
        roomCode: room.code,
        moveX: 0,
        moveY: 0,
        aimX: room.players.host.x + 200,
        aimY: room.players.host.y,
        firing: false
      },
      10_005
    );

    expect(room.playerInputs.host.firing).toBe(false);
    expect(room.playerInputs.host.fireQueued).toBe(true);
  });

  it("rejects non-finite input payload values without mutating player state", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    const originalInput = { ...room.playerInputs.host };
    const originalAim = { ...room.players.host.aim };
    const originalPosition = {
      x: room.players.host.x,
      y: room.players.host.y
    };

    const applied = applyInputPayloadToRoom(
      room,
      "host",
      {
        roomCode: room.code,
        moveX: Number.NaN,
        moveY: 0,
        aimX: Number.POSITIVE_INFINITY,
        aimY: room.players.host.y,
        firing: true
      },
      10_100
    );

    expect(applied).toBe(false);
    expect(room.playerInputs.host).toEqual(originalInput);
    expect(room.players.host.aim).toEqual(originalAim);
    expect(room.players.host.x).toBe(originalPosition.x);
    expect(room.players.host.y).toBe(originalPosition.y);
  });
});
