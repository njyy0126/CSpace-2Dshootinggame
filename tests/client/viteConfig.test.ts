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
});
