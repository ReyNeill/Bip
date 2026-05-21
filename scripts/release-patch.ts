import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const publishArgs = Bun.argv.slice(2);

assertCleanWorktree();

run(["bun", "run", "typecheck"]);
run(["bun", "run", "test:init"]);
run(["bun", "run", "test:scan"]);
run(["bun", "run", "test:tscore"]);

const nextVersion = bumpPatchVersion();
console.log(`Bumped package version to ${nextVersion}.`);

run(["bun", "run", "pack:dry-run"]);
run(["git", "add", "package.json"]);
run(["git", "commit", "-m", `Release @reyneill/bip@${nextVersion}`]);
run(["bun", "publish", "--access", "public", ...publishArgs]);

console.log(`Published @reyneill/bip@${nextVersion}.`);

function assertCleanWorktree(): void {
  const result = Bun.spawnSync({
    cmd: ["git", "status", "--porcelain"],
    cwd: root,
    stdout: "pipe",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error("Could not inspect git status.");
  }

  const status = result.stdout.toString().trim();

  if (status.length > 0) {
    throw new Error(`Release requires a clean git worktree.\n${status}`);
  }
}

function bumpPatchVersion(): string {
  const packagePath = path.join(root, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };

  if (!packageJson.version) {
    throw new Error("package.json is missing a version.");
  }

  const parts = packageJson.version.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Expected a SemVer version like 0.1.0, got ${packageJson.version}.`);
  }

  const [major, minor, patch] = parts as [number, number, number];
  const nextVersion = `${major}.${minor}.${patch + 1}`;
  packageJson.version = nextVersion;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  return nextVersion;
}

function run(cmd: string[]): void {
  console.log(`$ ${cmd.join(" ")}`);

  const result = Bun.spawnSync({
    cmd,
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${cmd.join(" ")}`);
  }
}
