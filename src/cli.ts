#!/usr/bin/env bun
import { verify } from "./commands/verify.ts";
import { verifyCore } from "./commands/verify-core.ts";

type ParsedArgs = {
  command: string | null;
  sourcePath: string | null;
  outDir: string;
  siteRoot: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));

  if (args.command === "verify-core" && args.sourcePath) {
    if (args.siteRoot) {
      process.env.BIP_REYNEILL_SITE_ROOT = args.siteRoot;
    }

    await verifyCore({
      sourcePath: args.sourcePath,
      outDir: args.outDir,
    });
    return;
  }

  if (args.command !== "verify" || !args.sourcePath) {
    printUsage();
    process.exitCode = 1;
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
    siteRoot: null,
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

    if (value === "--site-root") {
      const siteRoot = args[index + 1];

      if (!siteRoot) {
        throw new Error("--site-root requires a directory");
      }

      parsed.siteRoot = siteRoot;
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
  bun run src/cli.ts verify <source.ts> [--out generated]
  bun run src/cli.ts verify-core <source.tscore.ts> [--out generated/tscore] [--site-root ../reyneill]

Example:
  bun run src/cli.ts verify examples/counter.ts --out generated
  bun run src/cli.ts verify-core examples/personal-site.tscore.ts --out generated/tscore`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
