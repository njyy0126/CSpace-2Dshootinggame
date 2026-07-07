import { DEFAULT_MAP_ID, getMapSpawnPoints } from "../../shared/map";

export function chooseSpawnPoint(
  enemies: Array<{ x: number; y: number; alive: boolean }>,
  spawnPoints = getMapSpawnPoints(DEFAULT_MAP_ID)
) {
  const livingEnemies = enemies.filter((enemy) => enemy.alive);

  if (livingEnemies.length === 0) {
    return spawnPoints[0]!;
  }

  return (
    spawnPoints.map((spawn) => ({
      spawn,
      score: Math.min(
        ...livingEnemies.map((enemy) => Math.hypot(spawn.x - enemy.x, spawn.y - enemy.y))
      )
    })).sort((left, right) => right.score - left.score)[0]?.spawn ?? spawnPoints[0]!
  );
}
