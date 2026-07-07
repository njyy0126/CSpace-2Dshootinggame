import type { Vec2 } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function magnitude(vector: Vec2) {
  return Math.hypot(vector.x, vector.y);
}

export function normalize(vector: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const length = magnitude(vector);
  if (length === 0) {
    return fallback;
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y
  };
}

export function scale(vector: Vec2, scalar: number): Vec2 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar
  };
}

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
