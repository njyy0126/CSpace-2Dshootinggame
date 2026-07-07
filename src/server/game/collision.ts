import { ARENA_MAP, PLAYER_RADIUS } from "../../shared/constants";
import type { PlayerSnapshot, ProjectileSnapshot, Vec2, Wall } from "../../shared/types";

export interface ProjectileWallCollision {
  time: number;
  normalX: -1 | 0 | 1;
  normalY: -1 | 0 | 1;
}

export interface RayWallCollision {
  distance: number;
  normalX: -1 | 0 | 1;
  normalY: -1 | 0 | 1;
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function projectileHitsWall(projectile: ProjectileSnapshot, wall: Wall) {
  return (
    projectile.x + projectile.radius >= wall.x &&
    projectile.x - projectile.radius <= wall.x + wall.width &&
    projectile.y + projectile.radius >= wall.y &&
    projectile.y - projectile.radius <= wall.y + wall.height
  );
}

export function projectilePathHitsWall(
  projectile: ProjectileSnapshot,
  previousX: number,
  previousY: number,
  wall: Wall
) {
  return getProjectileWallCollision(projectile, previousX, previousY, wall) !== null;
}

export function getProjectileWallCollision(
  projectile: ProjectileSnapshot,
  previousX: number,
  previousY: number,
  wall: Wall
): ProjectileWallCollision | null {
  const minX = wall.x - projectile.radius;
  const maxX = wall.x + wall.width + projectile.radius;
  const minY = wall.y - projectile.radius;
  const maxY = wall.y + wall.height + projectile.radius;
  const deltaX = projectile.x - previousX;
  const deltaY = projectile.y - previousY;
  const { enter: enterX, exit: exitX } = projectAxis(previousX, deltaX, minX, maxX);
  if (enterX === null || exitX === null) {
    return null;
  }

  const { enter: enterY, exit: exitY } = projectAxis(previousY, deltaY, minY, maxY);
  if (enterY === null || exitY === null) {
    return null;
  }

  const enter = Math.max(enterX, enterY);
  const exit = Math.min(exitX, exitY);
  if (enter > exit || exit < 0 || enter > 1) {
    return null;
  }

  const epsilon = 1e-6;
  if (Math.abs(enterX - enterY) <= epsilon) {
    return {
      time: Math.max(0, enter),
      normalX: deltaX > 0 ? -1 : 1,
      normalY: deltaY > 0 ? -1 : 1
    };
  }

  if (enterX > enterY) {
    return {
      time: Math.max(0, enter),
      normalX: deltaX > 0 ? -1 : 1,
      normalY: 0
    };
  }

  return {
    time: Math.max(0, enter),
    normalX: 0,
    normalY: deltaY > 0 ? -1 : 1
  };
}

export function projectileHitsPlayer(projectile: ProjectileSnapshot, player: PlayerSnapshot) {
  return (
    Math.hypot(projectile.x - player.x, projectile.y - player.y) <= PLAYER_RADIUS + projectile.radius
  );
}

export function circleHitsWallAt(x: number, y: number, radius: number, wall: Wall) {
  const nearestX = clampValue(x, wall.x, wall.x + wall.width);
  const nearestY = clampValue(y, wall.y, wall.y + wall.height);
  const distanceX = x - nearestX;
  const distanceY = y - nearestY;

  return distanceX * distanceX + distanceY * distanceY < radius * radius;
}

export function playerHitsWallAt(x: number, y: number, wall: Wall) {
  return circleHitsWallAt(x, y, PLAYER_RADIUS, wall);
}

function projectAxis(start: number, delta: number, min: number, max: number) {
  if (delta === 0) {
    if (start < min || start > max) {
      return { enter: null, exit: null };
    }

    return { enter: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY };
  }

  const rawEnter = (min - start) / delta;
  const rawExit = (max - start) / delta;

  return {
    enter: Math.min(rawEnter, rawExit),
    exit: Math.max(rawEnter, rawExit)
  };
}

export function resolvePlayerMovement(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
  walls: Wall[]
) {
  let nextX = x;
  let nextY = y;

  const moveAlongAxis = (axisDeltaX: number, axisDeltaY: number) => {
    if (axisDeltaX === 0 && axisDeltaY === 0) {
      return;
    }

    let candidateX = clampValue(nextX + axisDeltaX, PLAYER_RADIUS, ARENA_MAP.width - PLAYER_RADIUS);
    let candidateY = clampValue(nextY + axisDeltaY, PLAYER_RADIUS, ARENA_MAP.height - PLAYER_RADIUS);
    const hitWalls = walls.filter((wall) => playerHitsWallAt(candidateX, candidateY, wall));

    if (hitWalls.length === 0) {
      nextX = candidateX;
      nextY = candidateY;
      return;
    }

    if (axisDeltaX > 0) {
      candidateX = Math.min(...hitWalls.map((wall) => wall.x - PLAYER_RADIUS), candidateX);
    } else if (axisDeltaX < 0) {
      candidateX = Math.max(...hitWalls.map((wall) => wall.x + wall.width + PLAYER_RADIUS), candidateX);
    }

    if (axisDeltaY > 0) {
      candidateY = Math.min(...hitWalls.map((wall) => wall.y - PLAYER_RADIUS), candidateY);
    } else if (axisDeltaY < 0) {
      candidateY = Math.max(...hitWalls.map((wall) => wall.y + wall.height + PLAYER_RADIUS), candidateY);
    }

    candidateX = clampValue(candidateX, PLAYER_RADIUS, ARENA_MAP.width - PLAYER_RADIUS);
    candidateY = clampValue(candidateY, PLAYER_RADIUS, ARENA_MAP.height - PLAYER_RADIUS);

    if (!walls.some((wall) => playerHitsWallAt(candidateX, candidateY, wall))) {
      nextX = candidateX;
      nextY = candidateY;
    }
  };

  moveAlongAxis(deltaX, 0);
  moveAlongAxis(0, deltaY);

  return { x: nextX, y: nextY };
}

export function distancePointToSegment(point: Vec2, start: Vec2, end: Vec2) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = clampValue(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared,
    0,
    1
  );
  const nearestX = start.x + segmentX * projection;
  const nearestY = start.y + segmentY * projection;

  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

export function segmentHitsPlayer(start: Vec2, end: Vec2, radius: number, player: PlayerSnapshot) {
  return distancePointToSegment(player, start, end) <= PLAYER_RADIUS + radius;
}

export function getRayWallCollision(origin: Vec2, direction: Vec2, radius: number, wall: Wall): RayWallCollision | null {
  const minX = wall.x - radius;
  const maxX = wall.x + wall.width + radius;
  const minY = wall.y - radius;
  const maxY = wall.y + wall.height + radius;
  const { enter: enterX, exit: exitX } = projectAxis(origin.x, direction.x, minX, maxX);
  if (enterX === null || exitX === null) {
    return null;
  }

  const { enter: enterY, exit: exitY } = projectAxis(origin.y, direction.y, minY, maxY);
  if (enterY === null || exitY === null) {
    return null;
  }

  const enter = Math.max(enterX, enterY);
  const exit = Math.min(exitX, exitY);
  if (enter > exit || exit < 0) {
    return null;
  }

  const epsilon = 1e-6;
  if (Math.abs(enterX - enterY) <= epsilon) {
    return {
      distance: Math.max(0, enter),
      normalX: direction.x > 0 ? -1 : 1,
      normalY: direction.y > 0 ? -1 : 1
    };
  }

  if (enterX > enterY) {
    return {
      distance: Math.max(0, enter),
      normalX: direction.x > 0 ? -1 : 1,
      normalY: 0
    };
  }

  return {
    distance: Math.max(0, enter),
    normalX: 0,
    normalY: direction.y > 0 ? -1 : 1
  };
}

export function findRayWallCollision(origin: Vec2, direction: Vec2, radius: number, walls: Wall[]) {
  return walls
    .map((wall) => ({
      wall,
      collision: getRayWallCollision(origin, direction, radius, wall)
    }))
    .filter((candidate): candidate is { wall: Wall; collision: RayWallCollision } => candidate.collision !== null)
    .sort((left, right) => left.collision.distance - right.collision.distance)[0];
}

export function isNavigablePoint(x: number, y: number, walls: Wall[], radius = PLAYER_RADIUS) {
  return (
    x >= radius &&
    x <= ARENA_MAP.width - radius &&
    y >= radius &&
    y <= ARENA_MAP.height - radius &&
    !walls.some((wall) => circleHitsWallAt(x, y, radius, wall))
  );
}
