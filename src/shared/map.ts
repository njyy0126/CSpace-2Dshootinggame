import { ARENA_MAP } from "./constants";
import type { ArenaMapDefinition, MapId, SpawnPoint, Wall } from "./types";

function createBoundaryWalls(mapId: MapId): Wall[] {
  return [
    {
      id: `${mapId}-b-top`,
      kind: "boundary",
      destructible: false,
      x: 0,
      y: 0,
      width: ARENA_MAP.width,
      height: 24
    },
    {
      id: `${mapId}-b-bottom`,
      kind: "boundary",
      destructible: false,
      x: 0,
      y: ARENA_MAP.height - 24,
      width: ARENA_MAP.width,
      height: 24
    },
    {
      id: `${mapId}-b-left`,
      kind: "boundary",
      destructible: false,
      x: 0,
      y: 0,
      width: 24,
      height: ARENA_MAP.height
    },
    {
      id: `${mapId}-b-right`,
      kind: "boundary",
      destructible: false,
      x: ARENA_MAP.width - 24,
      y: 0,
      width: 24,
      height: ARENA_MAP.height
    }
  ];
}

function createMap(
  id: MapId,
  name: string,
  summary: string,
  spawnPoints: SpawnPoint[],
  coverWalls: Wall[]
): ArenaMapDefinition {
  return {
    id,
    name,
    summary,
    spawnPoints,
    walls: [...createBoundaryWalls(id), ...coverWalls]
  };
}

export const MAPS: ArenaMapDefinition[] = [
  createMap(
    "crossroads",
    "Crossroads",
    "Open cross lanes, layered side bunkers, and a busy central plaza.",
    [
      { id: "crossroads-s1", x: 120, y: 120 },
      { id: "crossroads-s2", x: 840, y: 520 },
      { id: "crossroads-s3", x: 840, y: 120 },
      { id: "crossroads-s4", x: 120, y: 520 },
      { id: "crossroads-s5", x: 480, y: 92 },
      { id: "crossroads-s6", x: 480, y: 548 }
    ],
    [
      {
        id: "crossroads-center-nw",
        kind: "cover",
        destructible: true,
        x: 350,
        y: 200,
        width: 104,
        height: 64
      },
      {
        id: "crossroads-center-ne",
        kind: "cover",
        destructible: true,
        x: 506,
        y: 200,
        width: 104,
        height: 64
      },
      {
        id: "crossroads-center-sw",
        kind: "cover",
        destructible: true,
        x: 350,
        y: 376,
        width: 104,
        height: 64
      },
      {
        id: "crossroads-center-se",
        kind: "cover",
        destructible: true,
        x: 506,
        y: 376,
        width: 104,
        height: 64
      },
      {
        id: "crossroads-west-top",
        kind: "cover",
        destructible: true,
        x: 164,
        y: 170,
        width: 88,
        height: 28
      },
      {
        id: "crossroads-west-bottom",
        kind: "cover",
        destructible: true,
        x: 164,
        y: 442,
        width: 88,
        height: 28
      },
      {
        id: "crossroads-east-top",
        kind: "cover",
        destructible: true,
        x: 708,
        y: 170,
        width: 88,
        height: 28
      },
      {
        id: "crossroads-east-bottom",
        kind: "cover",
        destructible: true,
        x: 708,
        y: 442,
        width: 88,
        height: 28
      },
      {
        id: "crossroads-top-bridge",
        kind: "cover",
        destructible: true,
        x: 392,
        y: 122,
        width: 176,
        height: 20
      },
      {
        id: "crossroads-bottom-bridge",
        kind: "cover",
        destructible: true,
        x: 392,
        y: 498,
        width: 176,
        height: 20
      }
    ]
  ),
  createMap(
    "switchback",
    "Switchback",
    "Two mirrored zig-zag corridors with flank pockets and staggered choke points.",
    [
      { id: "switchback-s1", x: 96, y: 96 },
      { id: "switchback-s2", x: 864, y: 544 },
      { id: "switchback-s3", x: 96, y: 544 },
      { id: "switchback-s4", x: 864, y: 96 },
      { id: "switchback-s5", x: 96, y: 320 },
      { id: "switchback-s6", x: 864, y: 320 }
    ],
    [
      {
        id: "switchback-left-top-pillar",
        kind: "cover",
        destructible: true,
        x: 276,
        y: 94,
        width: 36,
        height: 196
      },
      {
        id: "switchback-left-bottom-pillar",
        kind: "cover",
        destructible: true,
        x: 276,
        y: 350,
        width: 36,
        height: 196
      },
      {
        id: "switchback-right-top-pillar",
        kind: "cover",
        destructible: true,
        x: 648,
        y: 94,
        width: 36,
        height: 196
      },
      {
        id: "switchback-right-bottom-pillar",
        kind: "cover",
        destructible: true,
        x: 648,
        y: 350,
        width: 36,
        height: 196
      },
      {
        id: "switchback-top-bridge",
        kind: "cover",
        destructible: true,
        x: 324,
        y: 242,
        width: 312,
        height: 24
      },
      {
        id: "switchback-bottom-bridge",
        kind: "cover",
        destructible: true,
        x: 324,
        y: 374,
        width: 312,
        height: 24
      },
      {
        id: "switchback-west-hinge",
        kind: "cover",
        destructible: true,
        x: 162,
        y: 294,
        width: 84,
        height: 24
      },
      {
        id: "switchback-east-hinge",
        kind: "cover",
        destructible: true,
        x: 714,
        y: 294,
        width: 84,
        height: 24
      },
      {
        id: "switchback-top-flank-west",
        kind: "cover",
        destructible: true,
        x: 114,
        y: 150,
        width: 104,
        height: 24
      },
      {
        id: "switchback-top-flank-east",
        kind: "cover",
        destructible: true,
        x: 742,
        y: 150,
        width: 104,
        height: 24
      },
      {
        id: "switchback-bottom-flank-west",
        kind: "cover",
        destructible: true,
        x: 114,
        y: 466,
        width: 104,
        height: 24
      },
      {
        id: "switchback-bottom-flank-east",
        kind: "cover",
        destructible: true,
        x: 742,
        y: 466,
        width: 104,
        height: 24
      }
    ]
  ),
  createMap(
    "citadel",
    "Citadel",
    "A central keep with ring routes, gate fights, and deep side flanks.",
    [
      { id: "citadel-s1", x: 136, y: 116 },
      { id: "citadel-s2", x: 824, y: 524 },
      { id: "citadel-s3", x: 136, y: 524 },
      { id: "citadel-s4", x: 824, y: 116 },
      { id: "citadel-s5", x: 480, y: 88 },
      { id: "citadel-s6", x: 480, y: 552 }
    ],
    [
      {
        id: "citadel-keep",
        kind: "cover",
        destructible: true,
        x: 398,
        y: 228,
        width: 164,
        height: 184
      },
      {
        id: "citadel-top-gate-left",
        kind: "cover",
        destructible: true,
        x: 348,
        y: 162,
        width: 64,
        height: 28
      },
      {
        id: "citadel-top-gate-right",
        kind: "cover",
        destructible: true,
        x: 548,
        y: 162,
        width: 64,
        height: 28
      },
      {
        id: "citadel-bottom-gate-left",
        kind: "cover",
        destructible: true,
        x: 348,
        y: 450,
        width: 64,
        height: 28
      },
      {
        id: "citadel-bottom-gate-right",
        kind: "cover",
        destructible: true,
        x: 548,
        y: 450,
        width: 64,
        height: 28
      },
      {
        id: "citadel-west-lane-top",
        kind: "cover",
        destructible: true,
        x: 202,
        y: 178,
        width: 96,
        height: 24
      },
      {
        id: "citadel-west-lane-bottom",
        kind: "cover",
        destructible: true,
        x: 202,
        y: 438,
        width: 96,
        height: 24
      },
      {
        id: "citadel-east-lane-top",
        kind: "cover",
        destructible: true,
        x: 662,
        y: 178,
        width: 96,
        height: 24
      },
      {
        id: "citadel-east-lane-bottom",
        kind: "cover",
        destructible: true,
        x: 662,
        y: 438,
        width: 96,
        height: 24
      },
      {
        id: "citadel-west-buttress",
        kind: "cover",
        destructible: true,
        x: 130,
        y: 278,
        width: 60,
        height: 84
      },
      {
        id: "citadel-east-buttress",
        kind: "cover",
        destructible: true,
        x: 770,
        y: 278,
        width: 60,
        height: 84
      },
      {
        id: "citadel-north-screen",
        kind: "cover",
        destructible: true,
        x: 434,
        y: 121,
        width: 92,
        height: 18
      },
      {
        id: "citadel-south-screen",
        kind: "cover",
        destructible: true,
        x: 434,
        y: 501,
        width: 92,
        height: 18
      }
    ]
  )
];

export const DEFAULT_MAP_ID: MapId = MAPS[0]!.id;

const MAPS_BY_ID = new Map(MAPS.map((map) => [map.id, map] as const));

export function isMapId(value: string): value is MapId {
  return MAPS_BY_ID.has(value as MapId);
}

export function getMapDefinition(mapId: MapId) {
  return MAPS_BY_ID.get(mapId) ?? MAPS_BY_ID.get(DEFAULT_MAP_ID)!;
}

export function getMapSpawnPoints(mapId: MapId) {
  return getMapDefinition(mapId).spawnPoints;
}

export function getMapWalls(mapId: MapId) {
  return structuredClone(getMapDefinition(mapId).walls);
}

export const SPAWN_POINTS: SpawnPoint[] = getMapSpawnPoints(DEFAULT_MAP_ID);
export const WALLS: Wall[] = getMapWalls(DEFAULT_MAP_ID);
