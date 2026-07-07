import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("client runtime stack", () => {
  it("pins Phaser 3, which is the version required by the design doc and scene APIs", () => {
    const packageJsonPath = path.resolve("package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.phaser).toMatch(/^(\^|~)?3\./);
  });
});
