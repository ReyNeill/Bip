import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Exercises `bip verify --check` end to end in a throwaway project. Needs Lean, like `bip verify`.
const cli = path.resolve(import.meta.dir, "../src/cli.ts");
const root = mkdtempSync(path.join(tmpdir(), "bip-check-"));

try {
  write("bip.config.ts", `export default { modules: [{ name: "site", source: "bip/site.tscore.ts", outDir: "src/generated/bip/site" }] };\n`);
  writeModule("Home", []);

  const missing = run("verify", "--check");
  expect(missing.exitCode === 1, "check fails before anything is generated", missing.output);
  for (const file of ["runtime/SiteCore.ts", "proofs/SiteCore.lean", "proof-manifest.json"]) {
    expect(missing.output.includes(`src/generated/bip/site/${file}`), `check lists missing ${file}`, missing.output);
  }

  const verified = run("verify");
  expect(verified.exitCode === 0, "verify succeeds", verified.output);

  const current = run("verify", "--check");
  expect(current.exitCode === 0 && current.output.includes("are current (1 module)"), "check passes after verify", current.output);

  writeModule("Start", []);
  const stale = run("verify", "--check");
  expect(stale.exitCode === 1, "check fails after the source changes", stale.output);
  expect(stale.output.includes("runtime/SiteCore.ts"), "check lists the stale runtime file", stale.output);
  expect(!stale.output.includes("proof-manifest.json"), "check leaves the unchanged manifest out", stale.output);

  writeModule("Home", [{ kind: "function", name: "routePath", parameters: [{ name: "route", type: { kind: "named", name: "PageRoute" } }], returns: { kind: "primitive", name: "String" }, body: { kind: "field", target: { kind: "var", name: "route" }, field: "path" }, contracts: [{ kind: "returnsField", parameter: "route", field: "path" }] }]);
  const removed = run("verify", "--check");
  expect(removed.exitCode === 1 && removed.output.includes("uses removed contract 'returnsField'"), "check reports removed contracts", removed.output);

  console.log("Verify --check tests passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}

// A plain-object module, so the fixture needs no "bip" dependency.
function writeModule(label: string, functions: unknown[]): void {
  const module = {
    kind: "TSCoreModule",
    name: "SiteCore",
    records: [{ kind: "record", name: "PageRoute", fields: [{ name: "path", type: { kind: "primitive", name: "String" } }, { name: "label", type: { kind: "primitive", name: "String" } }] }],
    unions: [],
    constants: [
      {
        kind: "constant",
        name: "siteRoutes",
        type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
        value: { kind: "array", items: [{ kind: "record", typeName: "PageRoute", fields: { path: { kind: "string", value: "/" }, label: { kind: "string", value: label } } }] },
        contracts: [{ kind: "nonEmptyArray" }, { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" }],
      },
    ],
    functions,
    stateMachines: [],
  };
  write("bip/site.tscore.ts", `export default ${JSON.stringify(module, null, 2)};\n`);
}

function write(relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

// Runs the CLI in a fresh process, so each run imports the module source as it is on disk.
function run(...args: string[]): { exitCode: number; output: string } {
  const result = Bun.spawnSync({ cmd: ["bun", cli, ...args], cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

function expect(condition: boolean, name: string, output: string): void {
  if (!condition) {
    throw new Error(`${name} failed. Output:\n${output}`);
  }
}
