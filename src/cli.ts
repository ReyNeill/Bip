#!/usr/bin/env bun
import { statSync } from "node:fs";
import { verify } from "./commands/verify.ts";
import { verifyCore } from "./commands/verify-core.ts";
import { verifyProject } from "./commands/verify-project.ts";
import { scanProject } from "./commands/scan.ts";
import { initProject } from "./commands/init.ts";

type ParsedArgs = {
  command: string | null;
  sourcePath: string | null;
  outDir: string;
};

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.command === "verify-core" && args.sourcePath) {
    await verifyCore({
      sourcePath: args.sourcePath,
      outDir: args.outDir,
    });
    return;
  }

  if (args.command === "init") {
    await initProject();
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
    await verifyProject(process.cwd());
    return;
  }

  if (args.sourcePath.includes(".tscore.")) {
    await verifyCore({
      sourcePath: args.sourcePath,
      outDir: args.outDir,
    });
    return;
  }

  await verify({
    sourcePath: args.sourcePath,
    outDir: args.outDir,
  });
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: args[0] ?? null,
    sourcePath: null,
    outDir: "generated",
  };

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];

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
  bun run src/cli.ts init
  bun run src/cli.ts verify
  bun run src/cli.ts verify <source.ts> [--out generated]
  bun run src/cli.ts verify-core <source.tscore.ts> [--out generated/tscore]
  bun run src/cli.ts scan

Example:
  bun run src/cli.ts verify
  bun run src/cli.ts verify examples/counter.ts --out generated
  bun run src/cli.ts verify-core examples/basic-site.tscore.ts --out generated/tscore
  bun run src/cli.ts scan`);
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
