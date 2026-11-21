import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProofManifest } from "../manifest.ts";
import type { LeanCheckResult } from "../generated/bip/runtime/ScanScoring.ts";
import { checkLean, LEAN_TOOLCHAIN, leanCheckPassed } from "../lean/check.ts";
import { emitTSCoreLean } from "../tscore/emit-lean.ts";
import { emitTSCoreTypeScript } from "../tscore/emit-ts.ts";
import type { TSCoreModule } from "../tscore/types.ts";
import { validateModule } from "../tscore/validate.ts";
import { writeTextFile } from "../utils/fs.ts";

export type VerifyCoreOptions = {
  sourcePath: string;
  outDir: string;
};

type GeneratedFile = {
  path: string;
  content: string;
};

// Everything `bip verify` writes for one module. Generation is deterministic, so regenerating in
// memory and comparing with the committed files is an exact staleness check.
type GeneratedModule = {
  runtime: GeneratedFile;
  proof: GeneratedFile;
  manifest: (leanCheck: LeanCheckResult) => GeneratedFile;
};

export async function verifyCore(options: VerifyCoreOptions): Promise<void> {
  const generated = generateModule(await loadValidModule(options.sourcePath), options);

  await writeTextFile(generated.runtime.path, generated.runtime.content);
  await writeTextFile(generated.proof.path, generated.proof.content);

  const leanCheck = await checkLean([generated.proof.path]);
  const manifest = generated.manifest(leanCheck);
  await writeTextFile(manifest.path, manifest.content);

  console.log(`Bip verify-core wrote ${manifest.path}`);
  console.log(`Runtime TypeScript: ${generated.runtime.path}`);
  console.log(`Lean proof: ${generated.proof.path}`);
  console.log(`Lean check: ${leanCheck.status} - ${leanCheck.detail}`);

  if (leanCheck.status === "failed") {
    process.exitCode = 1;
  }
}

// Regenerates a module in memory, without running Lean, and returns the paths of generated files
// whose committed copy is missing or different. The expected manifest is the one a passing
// `bip verify` writes, so a committed manifest recording a failed Lean check is stale too.
export async function findStaleArtifacts(options: VerifyCoreOptions): Promise<string[]> {
  const generated = generateModule(await loadValidModule(options.sourcePath), options);
  const files = [generated.runtime, generated.proof, generated.manifest(leanCheckPassed(1))];
  const stale = await Promise.all(files.map(async (file) => ((await readOptional(file.path)) === file.content ? null : file.path)));

  return stale.filter((filePath) => filePath !== null);
}

function generateModule(module: TSCoreModule, options: VerifyCoreOptions): GeneratedModule {
  const outDir = path.resolve(options.outDir);
  const source = path.relative(process.cwd(), path.resolve(options.sourcePath));
  const lean = emitTSCoreLean(module);

  return {
    runtime: { path: path.join(outDir, "runtime", `${module.name}.ts`), content: emitTSCoreTypeScript(module) },
    proof: { path: path.join(outDir, lean.relativePath), content: lean.content },
    manifest: (leanCheck) => {
      const manifest: ProofManifest = {
        checker: "lean4",
        toolchain: LEAN_TOOLCHAIN,
        source,
        proofFile: lean.relativePath,
        leanCheck,
        verifiedExports: lean.exports,
      };

      return { path: path.join(outDir, "proof-manifest.json"), content: `${JSON.stringify(manifest, null, 2)}\n` };
    },
  };
}

async function loadValidModule(sourcePath: string): Promise<TSCoreModule> {
  const module = await loadTSCoreModule(path.resolve(sourcePath));
  const errors = validateModule(module);

  if (errors.length > 0) {
    throw new Error(errors.map((error) => `TSCore validation error in ${sourcePath}: ${error}`).join("\n"));
  }

  return module;
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function loadTSCoreModule(sourcePath: string): Promise<TSCoreModule> {
  const imported = await import(pathToFileURL(sourcePath).href);
  const module = imported.default ?? imported.module ?? imported.tsCoreModule;

  if (!isTSCoreModule(module)) {
    throw new Error(`Expected ${sourcePath} to export a TSCoreModule as default, module, or tsCoreModule.`);
  }

  return module;
}

function isTSCoreModule(value: unknown): value is TSCoreModule {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as TSCoreModule).kind === "TSCoreModule" &&
      typeof (value as TSCoreModule).name === "string",
  );
}
