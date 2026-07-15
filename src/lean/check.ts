import { access } from "node:fs/promises";
import path from "node:path";
import {
  leanCheckChecked,
  leanCheckFailed,
  leanCheckSkipped,
  type LeanCheckResult,
} from "../generated/bip/runtime/ScanScoring.ts";

export const MISSING_LEAN_HINT = [
  "Lean was not found on PATH or ~/.elan/bin, so generated proof files were not kernel-checked.",
  "Install it with `brew install elan-init && elan-init -y --default-toolchain stable` (macOS)",
  "or follow https://leanprover-community.github.io/get_started.html, then re-run.",
].join(" ");

export async function checkLean(proofFiles: string[]): Promise<LeanCheckResult> {
  if (proofFiles.length === 0) {
    return leanCheckSkipped("No generated Lean proof files to check.");
  }

  const leanPath = await findCommand("lean");

  if (!leanPath) {
    return leanCheckFailed(MISSING_LEAN_HINT);
  }

  for (const proofFile of proofFiles) {
    const proc = Bun.spawn([leanPath, proofFile], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      const stdout = await new Response(proc.stdout).text();
      const output = [stderr, stdout].filter(Boolean).join("\n");
      return leanCheckFailed(`Lean failed for ${proofFile}:\n${output}`);
    }
  }

  return leanCheckChecked(`Lean checked ${proofFiles.length} proof file(s).`);
}

async function findCommand(command: string): Promise<string | null> {
  const pathCandidates = (process.env.PATH ?? "").split(path.delimiter).map((dir) => path.join(dir, command));
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
