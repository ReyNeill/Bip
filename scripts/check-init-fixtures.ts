import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initProject } from "../src/commands/init.ts";

await withFixture("creates scaffold in an explicit directory", async (root) => {
  const target = path.join(root, "new-project");
  const output = await captureInit(target);

  assertFileIncludes(path.join(target, "bip.config.ts"), "source: \"bip/example.tscore.ts\"");
  assertFileIncludes(path.join(target, "bip/example.tscore.ts"), "defineModule");
  assertFileIncludes(path.join(target, "AGENTS.md"), "bunx bip verify");
  assertIncludes(output, "Bip initialized.");
  assertIncludes(output, "Next: bunx bip verify");
});

await withFixture("preserves existing scaffold files", async (root) => {
  const target = path.join(root, "existing-project");
  const configPath = path.join(target, "bip.config.ts");
  const modulePath = path.join(target, "bip/example.tscore.ts");
  const agentsPath = path.join(target, "AGENTS.md");

  mkdirSync(path.dirname(modulePath), { recursive: true });
  writeFileSync(configPath, "export default { modules: [] };\n", "utf8");
  writeFileSync(modulePath, "export const custom = true;\n", "utf8");
  writeFileSync(agentsPath, "# Project Notes\n", "utf8");

  const output = await captureInit(target);

  assertFileEquals(configPath, "export default { modules: [] };\n");
  assertFileEquals(modulePath, "export const custom = true;\n");
  assertFileIncludes(agentsPath, "# Project Notes\n\n## Bip");
  assertIncludes(output, "Skipped existing");
  assertIncludes(output, "Updated");
});

await withFixture("does not duplicate an existing Bip agent note", async (root) => {
  const target = path.join(root, "noted-project");
  const agentsPath = path.join(target, "AGENTS.md");

  mkdirSync(target, { recursive: true });
  writeFileSync(agentsPath, "## Bip\nUse `bunx bip verify` to check proofs.\n", "utf8");

  await captureInit(target);
  assertFileEquals(agentsPath, "## Bip\nUse `bunx bip verify` to check proofs.\n");
});

console.log("Init fixture tests passed.");

async function withFixture(name: string, run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "bip-init-"));

  try {
    await run(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} failed:\n${message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function captureInit(root: string): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];

  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  try {
    await initProject(root);
    return lines.join("\n");
  } finally {
    console.log = originalLog;
  }
}

function assertFileIncludes(filePath: string, expected: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Expected ${filePath} to exist.`);
  }

  assertIncludes(readFileSync(filePath, "utf8"), expected);
}

function assertFileEquals(filePath: string, expected: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Expected ${filePath} to exist.`);
  }

  const actual = readFileSync(filePath, "utf8");
  if (actual !== expected) {
    throw new Error(`Expected ${filePath} to equal:\n${expected}\nActual:\n${actual}`);
  }
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected value to include '${expected}'.\n\nActual:\n${value}`);
  }
}
