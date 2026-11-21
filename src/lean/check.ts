import { access } from "node:fs/promises";
import path from "node:path";
import type { LeanCheckResult } from "../generated/bip/runtime/ScanScoring.ts";

// The Lean toolchain generated proofs are written for. Tactics such as `simp` and `decide` change
// between Lean releases, so proofs are only checked by this exact version: through elan when it
// is installed (installing the toolchain on first use), otherwise by a `lean` that reports it.
export const LEAN_TOOLCHAIN = "leanprover/lean4:v4.32.0";

const LEAN_VERSION = LEAN_TOOLCHAIN.replace(/^.*:v/, "");

export const MISSING_LEAN_HINT = [
  "Lean was not found on PATH or ~/.elan/bin, so generated proof files were not kernel-checked.",
  "Install elan with `brew install elan-init && elan-init -y` (macOS)",
  "or follow https://leanprover-community.github.io/get_started.html, then re-run.",
].join(" ");

// The result `checkLean` returns when every proof file checks. `bip verify --check` uses it to
// rebuild the manifest a passing run would have written.
export function leanCheckPassed(proofFileCount: number): LeanCheckResult {
  return { status: "checked", detail: `Lean checked ${proofFileCount} proof file(s).` };
}

export async function checkLean(proofFiles: string[]): Promise<LeanCheckResult> {
  if (proofFiles.length === 0) {
    return { status: "skipped", detail: "No generated Lean proof files to check." };
  }

  const lean = await leanCommand();

  if ("failure" in lean) {
    return { status: "failed", detail: lean.failure };
  }

  for (const proofFile of proofFiles) {
    const result = await run([...lean.command, proofFile]);

    if (result.exitCode !== 0) {
      return { status: "failed", detail: `Lean failed for ${proofFile}:\n${result.output}` };
    }
  }

  return leanCheckPassed(proofFiles.length);
}

// The command that runs the pinned Lean, or why there is none.
async function leanCommand(): Promise<{ command: string[] } | { failure: string }> {
  const elan = await findCommand("elan");

  if (elan) {
    return { command: [elan, "run", "--install", LEAN_TOOLCHAIN, "lean"] };
  }

  const lean = await findCommand("lean");

  if (!lean) {
    return { failure: MISSING_LEAN_HINT };
  }

  const version = await run([lean, "--version"]);

  if (!version.output.includes(`version ${LEAN_VERSION}`)) {
    return {
      failure: `Bip proofs need ${LEAN_TOOLCHAIN}, but ${lean} reports: ${version.output.trim()}. Install elan so Bip can run the pinned toolchain.`,
    };
  }

  return { command: [lean] };
}

async function run(cmd: string[]): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn(cmd, { stderr: "pipe", stdout: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, output: [stderr, stdout].filter(Boolean).join("\n") };
}

async function findCommand(command: string): Promise<string | null> {
  const pathCandidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((dir) => path.join(dir, command));
  const candidates = [
    ...pathCandidates,
    path.join(process.env.HOME ?? "", ".elan", "bin", command),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep searching PATH entries.
    }
  }

  return null;
}
