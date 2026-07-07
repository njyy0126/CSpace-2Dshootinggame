import { describe, expect, it } from "vitest";
import { PLAYER_MAX_HEALTH } from "../../src/shared/constants";
import { createPlayer, createDefaultInputState } from "../../src/server/game/state";
import { createRoomStore } from "../../src/server/rooms/roomStore";
import { MAPS } from "../../src/shared/map";

describe("room store", () => {
  it("creates a room with the creator as host", () => {
    const store = createRoomStore();
    const room = store.createRoom("socket-1", "Nina");

    expect(room.hostId).toBe("socket-1");
    expect(room.players["socket-1"]?.nickname).toBe("Nina");
  });

  it("prevents joining beyond max players", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");

    for (let i = 0; i < 5; i += 1) {
      store.joinRoom(room.code, `p-${i}`, `P${i}`);
    }

    expect(() => store.joinRoom(room.code, "overflow", "Overflow")).toThrow(/full/i);
  });

  it("does not throw when joining a room code that no longer exists", () => {
    const store = createRoomStore();

    const room = store.joinRoom("MISSING", "guest", "Guest");

    expect(room).toBeNull();
  });

  it("places lobby joiners on different spawn points", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");

    store.joinRoom(room.code, "guest", "Guest");

    expect(`${room.players.host.x},${room.players.host.y}`).not.toBe(
      `${room.players.guest.x},${room.players.guest.y}`
    );
  });

  it("marks mid-match joiners as waiting for the next round when a match is active", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "opponent", "Opponent");
    store.startMatch(room);

    store.joinRoom(room.code, "guest", "Guest");

    expect(room.players.guest?.waitingForNextRound).toBe(true);
    expect(room.players.guest?.alive).toBe(false);
  });

  it("starts a match by resetting players into the playing phase", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    room.players.host.kills = 3;
    room.players.host.health = 1;
    room.players.host.waitingForNextRound = true;
    room.phase = "lobby";
    (room.players.host as any).ability = "ricochet";
    (room as any).activePickups = {
      green: {
        id: "green",
        type: "ricochet",
        x: 200,
        y: 200,
        radius: 12,
        spawnedAt: 5_000
      }
    };

    store.startMatch(room);

    expect(room.phase).toBe("playing");
    expect(room.players.host.kills).toBe(0);
    expect(room.players.host.health).toBe(PLAYER_MAX_HEALTH);
    expect(room.players.host.waitingForNextRound).toBe(false);
    expect((room.players.host as any).ability).toBeNull();
    expect((room as any).activePickups).toEqual({});
  });

  it("does not start a match with fewer than two eligible players", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");

    const started = store.startMatch(room);

    expect(started).toBe(false);
    expect(room.phase).toBe("lobby");
  });

  it("returns one-player active matches to the lobby when someone joins", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    room.phase = "playing";

    store.joinRoom(room.code, "guest", "Guest");

    expect(room.phase).toBe("lobby");
    expect(room.players.guest?.waitingForNextRound).toBe(false);
    expect(room.players.guest?.alive).toBe(true);
  });

  it("returns active matches to the lobby when fewer than two eligible players remain", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    store.startMatch(room);

    const updatedRoom = store.removePlayer("guest");

    expect(updatedRoom?.phase).toBe("lobby");
    expect(updatedRoom?.players.host.waitingForNextRound).toBe(false);
    expect(updatedRoom?.players.host.alive).toBe(true);
  });

  it("starts a match with each player on a unique spawn point", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    store.joinRoom(room.code, "third", "Third");

    room.players.host.x = 400;
    room.players.host.y = 320;
    room.players.guest.x = 400;
    room.players.guest.y = 320;
    room.players.third.x = 400;
    room.players.third.y = 320;

    store.startMatch(room);

    const spawnPositions = Object.values(room.players).map((player) => `${player.x},${player.y}`);
    expect(new Set(spawnPositions).size).toBe(spawnPositions.length);
  });

  it("reassigns the host when the current host leaves", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const updatedRoom = store.removePlayer("host");

    expect(updatedRoom?.hostId).toBe("guest");
    expect(updatedRoom?.players.host).toBeUndefined();
  });

  it("lets a player explicitly leave a room and removes their input state", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const updatedRoom = store.leaveRoom(room.code, "guest");

    expect(updatedRoom?.players.guest).toBeUndefined();
    expect(updatedRoom?.playerInputs.guest).toBeUndefined();
  });

  it("reassigns the host when the host explicitly leaves a room", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");

    const updatedRoom = store.leaveRoom(room.code, "host");

    expect(updatedRoom?.hostId).toBe("guest");
    expect(updatedRoom?.players.host).toBeUndefined();
  });

  it("returns an active room to the lobby when an explicit leave drops it below two players", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    store.startMatch(room);
    (room.players.host as any).ability = "speed";
    room.activeProjectiles.demo = {
      id: "demo",
      ownerId: "host",
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      radius: 4,
      celebrationOnly: false,
      effect: null,
      ricochetsRemaining: 0
    };
    (room as any).activePickups = {
      red: {
        id: "red",
        type: "speed",
        x: 180,
        y: 180,
        radius: 12,
        spawnedAt: 9_000
      }
    };

    const updatedRoom = store.leaveRoom(room.code, "guest");

    expect(updatedRoom?.phase).toBe("lobby");
    expect(updatedRoom?.activeProjectiles).toEqual({});
    expect(updatedRoom?.players.host.waitingForNextRound).toBe(false);
    expect((updatedRoom?.players.host as any)?.ability).toBeNull();
    expect((updatedRoom as any)?.activePickups).toEqual({});
  });

  it("does not allow the same socket to join a second room without cleanup", () => {
    const store = createRoomStore();
    const firstRoom = store.createRoom("host", "Host");
    const secondRoom = store.createRoom("other-host", "Other Host");

    expect(() => store.joinRoom(secondRoom.code, "host", "Host")).toThrow(/already in a room/i);
    expect(firstRoom.players.host?.nickname).toBe("Host");
    expect(secondRoom.players.host).toBeUndefined();
  });

  it("removes legacy duplicate socket entries from every room on disconnect cleanup", () => {
    const store = createRoomStore();
    const firstRoom = store.createRoom("host", "Host");
    const secondRoom = store.createRoom("other-host", "Other Host");

    secondRoom.players.host = createPlayer("host", "Host", "#7dd3fc");
    secondRoom.playerInputs.host = createDefaultInputState();

    const affectedRooms = store.removePlayerEverywhere("host");

    expect(affectedRooms).toHaveLength(1);
    expect(affectedRooms[0]?.code).toBe(secondRoom.code);
    expect(store.getRoom(firstRoom.code)).toBeUndefined();
    expect(secondRoom.players.host).toBeUndefined();
    expect(secondRoom.playerInputs.host).toBeUndefined();
  });

  it("starts matches on the selected map with the selected map walls and spawn points", () => {
    const store = createRoomStore();
    const room = store.createRoom("host", "Host");
    store.joinRoom(room.code, "guest", "Guest");
    store.updateMap(room.code, "host", MAPS[1]!.id);

    store.startMatch(room);

    const spawnPositions = new Set(
      MAPS[1]!.spawnPoints.map((spawn) => `${spawn.x},${spawn.y}`)
    );

    expect(room.mapId).toBe(MAPS[1]!.id);
    expect(room.walls.map((wall) => wall.id)).toEqual(MAPS[1]!.walls.map((wall) => wall.id));
    expect(
      Object.values(room.players).every((player) => spawnPositions.has(`${player.x},${player.y}`))
    ).toBe(true);
  });

  it("lists room summaries with host nickname, player count, phase, and map", () => {
    const store = createRoomStore();
    const firstRoom = store.createRoom("host", "Host");
    store.joinRoom(firstRoom.code, "guest", "Guest");
    const secondRoom = store.createRoom("host-2", "Other Host");
    store.updateMap(secondRoom.code, "host-2", MAPS[1]!.id);
    store.startMatchByHost(firstRoom.code, "host");

    const summaries = store.listRoomSummaries();

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: firstRoom.code,
          hostNickname: "Host",
          playerCount: 2,
          phase: "playing",
          mapId: firstRoom.mapId
        }),
        expect.objectContaining({
          code: secondRoom.code,
          hostNickname: "Other Host",
          playerCount: 1,
          phase: "lobby",
          mapId: MAPS[1]!.id
        })
      ])
    );
  });
});
