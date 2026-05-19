import path from "node:path";
import { loadBipConfig } from "../config/load.ts";
import { verifyCore } from "./verify-core.ts";

export async function verifyProject(rootPath: string): Promise<void> {
  const loaded = await loadBipConfig(rootPath);
  const previousCwd = process.cwd();

  process.chdir(loaded.root);

  try {
    for (const moduleConfig of loaded.config.modules) {
      await verifyCore({
        sourcePath: path.resolve(loaded.root, moduleConfig.source),
        outDir: path.resolve(loaded.root, moduleConfig.outDir),
      });

      if (process.exitCode) {
        return;
      }
    }
  } finally {
    process.chdir(previousCwd);
  }
}
