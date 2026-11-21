import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFiles } from "./helpers.ts";

// `bip verify --check` end to end in one throwaway project. The steps share that project and run in
// order. Needs Lean, like `bip verify`.
const cli = path.resolve(import.meta.dir, "../src/cli.ts");
const root = mkdtempSync(path.join(tmpdir(), "bip-check-"));
const LEAN_TIMEOUT = 120_000;

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("bip verify --check", () => {
  test("fails and lists every file before anything is generated", () => {
    writeFiles(root, {
      "bip.config.ts": `export default { modules: [{ name: "site", source: "bip/site.tscore.ts", outDir: "src/generated/bip/site" }] };\n`,
    });
    writeModule("Home", []);

    const missing = run("verify", "--check");
    expect(missing.exitCode).toBe(1);
    for (const file of ["runtime/SiteCore.ts", "proofs/SiteCore.lean", "proof-manifest.json"]) {
      expect(missing.output).toContain(`src/generated/bip/site/${file}`);
    }
  });

  test(
    "passes after verify",
    () => {
      expect(run("verify").exitCode).toBe(0);
      const current = run("verify", "--check");
      expect(current.exitCode).toBe(0);
      expect(current.output).toContain("are current (1 module)");
    },
    LEAN_TIMEOUT,
  );

  test("lists only the files a source change makes stale", () => {
    writeModule("Start", []);
    const stale = run("verify", "--check");
    expect(stale.exitCode).toBe(1);
    expect(stale.output).toContain("runtime/SiteCore.ts");
    expect(stale.output).not.toContain("proof-manifest.json");
  });

  test("reports removed contracts", () => {
    writeModule("Home", [
      {
        kind: "function",
        name: "routePath",
        parameters: [{ name: "route", type: { kind: "named", name: "PageRoute" } }],
        returns: { kind: "primitive", name: "String" },
        body: { kind: "field", target: { kind: "var", name: "route" }, field: "path" },
        contracts: [{ kind: "returnsField", parameter: "route", field: "path" }],
      },
    ]);
    const removed = run("verify", "--check");
    expect(removed.exitCode).toBe(1);
    expect(removed.output).toContain("uses removed contract 'returnsField'");
  });

  // Plain `decide` hit Lean's recursion limit at about 1k characters of string data.
  test(
    "verify proves contracts on a 50-item constant with long strings",
    () => {
      writeLargeModule(50);
      const large = run("verify");
      expect(large.exitCode, large.output).toBe(0);
    },
    LEAN_TIMEOUT,
  );
});

// A plain-object module, so the fixture needs no "bip" dependency.
function writeModule(label: string, functions: unknown[]): void {
  const module = {
    kind: "TSCoreModule",
    name: "SiteCore",
    records: [
      {
        kind: "record",
        name: "PageRoute",
        fields: [
          { name: "path", type: { kind: "primitive", name: "String" } },
          { name: "label", type: { kind: "primitive", name: "String" } },
        ],
      },
    ],
    unions: [],
    constants: [
      {
        kind: "constant",
        name: "siteRoutes",
        type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
        value: {
          kind: "array",
          items: [
            {
              kind: "record",
              typeName: "PageRoute",
              fields: {
                path: { kind: "string", value: "/" },
                label: { kind: "string", value: label },
              },
            },
          ],
        },
        contracts: [
          { kind: "nonEmptyArray" },
          { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
        ],
      },
    ],
    functions,
    stateMachines: [],
  };
  writeFiles(root, {
    "bip/site.tscore.ts": `export default ${JSON.stringify(module, null, 2)};\n`,
  });
}

function writeLargeModule(count: number): void {
  const string = { kind: "primitive", name: "String" };
  const items = Array.from({ length: count }, (_, index) => ({
    kind: "record",
    typeName: "Project",
    fields: {
      slug: { kind: "string", value: `project-${index}` },
      description: {
        kind: "string",
        value: `Project ${index}: ${"a long description of what this project does and why it matters. ".repeat(2)}`,
      },
    },
  }));
  const module = {
    kind: "TSCoreModule",
    name: "SiteCore",
    records: [
      {
        kind: "record",
        name: "Project",
        fields: [
          { name: "slug", type: string },
          { name: "description", type: string },
        ],
      },
    ],
    unions: [],
    constants: [
      {
        kind: "constant",
        name: "projects",
        type: { kind: "array", item: { kind: "named", name: "Project" } },
        value: { kind: "array", items },
        contracts: [
          { kind: "nonEmptyArray" },
          { kind: "allItemsFieldNonEmpty", field: "description" },
          { kind: "allItemsFieldUnique", field: "slug" },
          { kind: "allItemsFieldStartsWith", field: "slug", prefix: "project-" },
        ],
      },
    ],
    functions: [],
    stateMachines: [],
  };
  writeFiles(root, { "bip/site.tscore.ts": `export default ${JSON.stringify(module)};\n` });
}

// Runs the CLI in a fresh process, so each run imports the module source as it is on disk.
function run(...args: string[]): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", cli, ...args],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}
