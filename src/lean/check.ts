import { access } from "node:fs/promises";
import path from "node:path";
import type { ProofManifest } from "../contracts/types.ts";

export async function checkLean(proofFiles: string[]): Promise<ProofManifest["leanCheck"]> {
  if (proofFiles.length === 0) {
    return {
      status: "skipped",
      detail: "No generated Lean proof files to check.",
    };
  }

  const leanPath = await findCommand("lean");

  if (!leanPath) {
    return {
      status: "skipped",
      detail: "Lean was not found on PATH. Generated proof files were not kernel-checked.",
    };
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
      return {
        status: "failed",
        detail: `Lean failed for ${proofFile}:\n${output}`,
      };
    }
  }

  return {
    status: "checked",
    detail: `Lean checked ${proofFiles.length} proof file(s).`,
  };
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
