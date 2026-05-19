import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BipConfig } from "./types.ts";

const CONFIG_NAMES = ["bip.config.ts", "bip.config.mts", "bip.config.js", "bip.config.mjs"] as const;

export type LoadedBipConfig = {
  root: string;
  path: string;
  config: BipConfig;
};

export async function loadBipConfig(rootPath: string): Promise<LoadedBipConfig> {
  const root = path.resolve(rootPath);
  const configPath = CONFIG_NAMES.map((name) => path.join(root, name)).find((candidate) => existsSync(candidate));

  if (!configPath) {
    throw new Error(`No Bip config found in ${root}. Expected ${CONFIG_NAMES.join(", ")}.`);
  }

  const imported = await import(pathToFileURL(configPath).href);
  const config = imported.default ?? imported.config;

  if (!isBipConfig(config)) {
    throw new Error(`${configPath} must export a Bip config as default or config.`);
  }

  return { root, path: configPath, config };
}

function isBipConfig(value: unknown): value is BipConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as BipConfig;
  return Array.isArray(candidate.modules);
}
