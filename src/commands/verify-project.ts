import path from "node:path";
import { type LoadedBipConfig, loadBipConfig } from "../config/load.ts";
import type { BipModuleConfig } from "../config/types.ts";
import { findStaleArtifacts, type VerifyCoreOptions, verifyCore } from "./verify-core.ts";

// `bip verify`: regenerates and Lean-checks every configured module.
export async function verifyProject(rootPath: string): Promise<void> {
  const loaded = await loadBipConfig(rootPath);

  await withProjectCwd(loaded, async () => {
    for (const moduleConfig of loaded.config.modules) {
      await verifyCore(moduleOptions(loaded, moduleConfig));

      if (process.exitCode) {
        return;
      }
    }
  });
}

// `bip verify --check`: regenerates every configured module in memory and fails when committed
// generated artifacts (runtime TypeScript, Lean, manifest) are missing or differ.
export async function checkProject(rootPath: string): Promise<void> {
  const loaded = await loadBipConfig(rootPath);
  const results = await checkProjectModules(loaded);

  const staleFiles = results.flatMap((result) => result.staleFiles);
  const failed = results.filter((result) => result.error);

  for (const result of failed) {
    console.error(
      `Module '${result.moduleConfig.name}' could not be regenerated:\n${result.error}`,
    );
    process.exitCode = 1;
  }

  if (failed.length === 0 || staleFiles.length > 0) {
    reportStaleArtifacts(staleFiles, results.length);
  }
}

export type ModuleFreshness = {
  moduleConfig: BipModuleConfig;
  // Absolute paths of generated files that are missing or differ from a fresh generation.
  staleFiles: string[];
  // Set when the module could not be loaded or failed TSCore validation.
  error: string | null;
};

export async function checkProjectModules(loaded: LoadedBipConfig): Promise<ModuleFreshness[]> {
  return withProjectCwd(loaded, async () => {
    const results: ModuleFreshness[] = [];

    for (const moduleConfig of loaded.config.modules) {
      try {
        results.push({
          moduleConfig,
          staleFiles: await findStaleArtifacts(moduleOptions(loaded, moduleConfig)),
          error: null,
        });
      } catch (error) {
        results.push({
          moduleConfig,
          staleFiles: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  });
}

// Prints the outcome of a staleness check and sets a failing exit code when files are stale.
export function reportStaleArtifacts(staleFiles: string[], moduleCount: number): void {
  if (staleFiles.length === 0) {
    console.log(
      `Bip generated artifacts are current (${moduleCount} module${moduleCount === 1 ? "" : "s"}).`,
    );
    return;
  }

  console.error("Bip generated artifacts are stale or missing:");

  for (const file of staleFiles) {
    console.error(`  ${path.relative(process.cwd(), file)}`);
  }

  console.error("Run `bunx bip verify` and commit the result.");
  process.exitCode = 1;
}

function moduleOptions(loaded: LoadedBipConfig, moduleConfig: BipModuleConfig): VerifyCoreOptions {
  return {
    sourcePath: path.resolve(loaded.root, moduleConfig.source),
    outDir: path.resolve(loaded.root, moduleConfig.outDir),
  };
}

// Modules load with the project root as cwd, so project adapters can read files relative to it and
// manifests record source paths relative to it.
async function withProjectCwd<T>(loaded: LoadedBipConfig, run: () => Promise<T>): Promise<T> {
  const previousCwd = process.cwd();
  process.chdir(loaded.root);

  try {
    return await run();
  } finally {
    process.chdir(previousCwd);
  }
}
