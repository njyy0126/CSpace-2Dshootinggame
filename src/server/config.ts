export const DEFAULT_PORT = 3000;

export function getPort() {
  const value = Number(process.env.PORT ?? DEFAULT_PORT);
  return Number.isFinite(value) ? value : DEFAULT_PORT;
}
