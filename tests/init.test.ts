import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { initProject } from "../src/commands/init.ts";
import { captureOutput, withTempDir, writeFiles } from "./helpers.ts";

const read = (filePath: string) => readFileSync(filePath, "utf8");

describe("bip init", () => {
  test("creates the scaffold in an explicit directory", () =>
    withTempDir(async (root) => {
      const target = path.join(root, "new-project");
      const { output } = await captureOutput(() => initProject(target));

      expect(read(path.join(target, "bip.config.ts"))).toContain('source: "bip/example.tscore.ts"');
      expect(read(path.join(target, "bip/example.tscore.ts"))).toContain("defineModule");
      expect(read(path.join(target, "AGENTS.md"))).toContain("bunx bip verify");
      expect(output).toContain("Bip initialized.");
    }));

  test("never overwrites existing files", () =>
    withTempDir(async (root) => {
      writeFiles(root, {
        "bip.config.ts": "export default { modules: [] };\n",
        "bip/example.tscore.ts": "export const custom = true;\n",
        "AGENTS.md": "# Project Notes\n",
      });

      const { output } = await captureOutput(() => initProject(root));

      expect(read(path.join(root, "bip.config.ts"))).toBe("export default { modules: [] };\n");
      expect(read(path.join(root, "bip/example.tscore.ts"))).toBe("export const custom = true;\n");
      expect(read(path.join(root, "AGENTS.md"))).toContain("# Project Notes\n\n## Bip");
      expect(output).toContain("Skipped existing");
    }));

  test("does not duplicate an existing Bip agent note", () =>
    withTempDir(async (root) => {
      const note = "## Bip\nUse `bunx bip verify` to check proofs.\n";
      writeFiles(root, { "AGENTS.md": note });

      await captureOutput(() => initProject(root));

      expect(read(path.join(root, "AGENTS.md"))).toBe(note);
    }));
});
