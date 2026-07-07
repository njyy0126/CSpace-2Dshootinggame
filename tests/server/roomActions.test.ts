import { describe, expect, it } from "vitest";
import { MAPS } from "../../src/shared/map";
import { createRoomStore } from "../../src/server/rooms/roomStore";

describe("room action permissions", () => {
  it("lets the host update the match target only while the room is in the lobby", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const updated = store.updateMatchTarget(room.code, "host", 20);

    expect(updated?.matchTarget).toBe(20);
  });

  it("ignores match target changes from non-host players", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const updated = store.updateMatchTarget(room.code, "guest", 20);

    expect(updated).toBeNull();
    expect(room.matchTarget).toBe(10);
  });

  it("lets only the host start a match", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const blocked = store.startMatchByHost(room.code, "guest");
    const started = store.startMatchByHost(room.code, "host");

    expect(blocked).toBeNull();
    expect(started?.phase).toBe("playing");
  });

  it("lets the host change the map only while the room is in the lobby", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const changed = store.updateMap(room.code, "host", MAPS[1]!.id);
    room.phase = "playing";
    const blockedInMatch = store.updateMap(room.code, "host", MAPS[2]!.id);
    const blockedForGuest = store.updateMap(room.code, "guest", MAPS[2]!.id);

    expect(changed?.mapId).toBe(MAPS[1]!.id);
    expect(blockedInMatch).toBeNull();
    expect(blockedForGuest).toBeNull();
    expect(room.mapId).toBe(MAPS[1]!.id);
  });
});
