import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

describe("vite dev server", () => {
  it("proxies Socket.IO traffic to the local game server during development", () => {
    const config = typeof viteConfig === "function" ? viteConfig({ command: "serve", mode: "test" }) : viteConfig;
    const proxy = config.server?.proxy;
    const socketProxy = typeof proxy === "object" && proxy ? proxy["/socket.io"] : undefined;

    expect(socketProxy).toBeDefined();
    expect(typeof socketProxy).toBe("object");
    expect(socketProxy && "target" in socketProxy ? socketProxy.target : undefined).toBe("http://localhost:3000");
  });

  it("splits Phaser into its own build chunk so the lazy arena bundle does not carry the full vendor weight alone", () => {
    const config = typeof viteConfig === "function" ? viteConfig({ command: "build", mode: "test" }) : viteConfig;
    const manualChunks = config.build?.rollupOptions?.output;
    const output = Array.isArray(manualChunks) ? manualChunks[0] : manualChunks;

    expect(output && "manualChunks" in output ? output.manualChunks : undefined).toBeTypeOf("function");
  });
});
