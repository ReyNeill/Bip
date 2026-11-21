#!/usr/bin/env bun
import { findStaleArtifacts, verifyCore, type VerifyCoreOptions } from "./commands/verify-core.ts";
import { checkProject, reportStaleArtifacts, verifyProject } from "./commands/verify-project.ts";
import { scanProject } from "./commands/scan.ts";
import { initProject } from "./commands/init.ts";

type ParsedArgs = {
  command: string | null;
  sourcePath: string | null;
  outDir: string;
  check: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.command === "verify-core" && args.sourcePath) {
    await runCore({ sourcePath: args.sourcePath, outDir: args.outDir }, args.check);
    return;
  }

  if (args.command === "init") {
    await initProject(args.sourcePath ?? process.cwd());
    return;
  }

  if (args.command === "scan") {
    await scanProject(args.sourcePath ?? process.cwd());
    return;
  }

  if (args.command !== "verify") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!args.sourcePath) {
    await (args.check ? checkProject(process.cwd()) : verifyProject(process.cwd()));
    return;
  }

  if (args.sourcePath.includes(".tscore.")) {
    await runCore({ sourcePath: args.sourcePath, outDir: args.outDir }, args.check);
    return;
  }

  throw new Error(`Expected a .tscore.ts module, got ${args.sourcePath}.`);
}

async function runCore(options: VerifyCoreOptions, check: boolean): Promise<void> {
  if (check) {
    reportStaleArtifacts(await findStaleArtifacts(options), 1);
    return;
  }

  await verifyCore(options);
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: args[0] ?? null,
    sourcePath: null,
    outDir: "generated/tscore",
    check: false,
  };

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--check") {
      parsed.check = true;
      continue;
    }

    if (value === "--out") {
      const outDir = args[index + 1];

      if (!outDir) {
        throw new Error("--out requires a directory");
      }

      parsed.outDir = outDir;
      index += 1;
      continue;
    }

    if (!parsed.sourcePath && value) {
      parsed.sourcePath = value;
    }
  }

  return parsed;
}

function printUsage(): void {
  console.log(`Usage:
  bun run src/cli.ts init [directory]
  bun run src/cli.ts verify [--check]
  bun run src/cli.ts verify <source.tscore.ts> [--out generated/tscore] [--check]
  bun run src/cli.ts verify-core <source.tscore.ts> [--out generated/tscore] [--check]
  bun run src/cli.ts scan

Example:
  bun run src/cli.ts init ../my-app
  bun run src/cli.ts verify
  bun run src/cli.ts verify --check
  bun run src/cli.ts verify-core examples/basic-site.tscore.ts --out generated/tscore
  bun run src/cli.ts scan

--check regenerates in memory without writing or running Lean, and exits non-zero
when committed generated artifacts are missing or differ.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
