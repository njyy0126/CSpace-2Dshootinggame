import { describe, expect, it } from "vitest";
import { getEmptyPlayfieldOverlayHtml } from "../../src/client/ui/playfieldOverlay";

describe("empty playfield overlay", () => {
  it("describes the arena as ready instead of saying it does not exist yet", () => {
    const html = getEmptyPlayfieldOverlayHtml();

    expect(html).toContain("Arena Ready");
    expect(html).not.toContain("will appear here next");
  });
});
