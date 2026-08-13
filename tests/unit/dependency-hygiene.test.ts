import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dependency hygiene (V-26)", () => {
  it("does not declare the unused resend package", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    expect(packageJson.dependencies?.resend).toBeUndefined();
    expect(packageJson.devDependencies?.resend).toBeUndefined();
  });
});
