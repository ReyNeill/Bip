import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProofManifest, VerifiedExport } from "../contracts/types.ts";
import { checkLean } from "../lean/check.ts";
import { emitTSCoreLean } from "../tscore/emit-lean.ts";
import { emitTSCoreTypeScript } from "../tscore/emit-ts.ts";
import type { TSCoreModule } from "../tscore/types.ts";
import { validateModule } from "../tscore/validate.ts";
import { writeTextFile } from "../utils/fs.ts";

export type VerifyCoreOptions = {
  sourcePath: string;
  outDir: string;
};

export async function verifyCore(options: VerifyCoreOptions): Promise<void> {
  const absoluteSourcePath = path.resolve(options.sourcePath);
  const sourcePath = path.relative(process.cwd(), absoluteSourcePath);
  const outDir = path.resolve(options.outDir);
  const module = await loadTSCoreModule(absoluteSourcePath);
  const validationErrors = validateModule(module);

  if (validationErrors.length > 0) {
    for (const error of validationErrors) {
      console.error(`TSCore validation error: ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });

  const leanArtifact = emitTSCoreLean(module);
  const proofPath = path.join(outDir, leanArtifact.relativePath);
  const runtimePath = path.join(outDir, "runtime", `${module.name}.ts`);

  await writeTextFile(proofPath, leanArtifact.content);
  await writeTextFile(runtimePath, emitTSCoreTypeScript(module));

  const leanCheck = await checkLean([proofPath]);
  const status: VerifiedExport["status"] = leanCheck.status;
  const verifiedExports: VerifiedExport[] = [
    ...module.constants.map((constant) => ({
      exportName: constant.name,
      model: "TSCoreConstant",
      proofFile: leanArtifact.relativePath,
      requires: [],
      ensures: constant.contracts?.map((contract) => contract.kind) ?? [],
      theoremNames: leanArtifact.theoremNames.filter((theoremName) => theoremName.includes(`.${constant.name}_`)),
      status,
    })),
    ...module.functions.map((fn) => ({
      exportName: fn.name,
      model: "TSCoreFunction",
      proofFile: leanArtifact.relativePath,
      requires: [],
      ensures: fn.contracts?.map((contract) => contract.kind) ?? [],
      theoremNames: leanArtifact.theoremNames.filter((theoremName) => theoremName.includes(`.${fn.name}_`)),
      status,
    })),
    ...module.stateMachines.map((machine) => ({
      exportName: machine.name,
      model: "TSCoreStateMachine",
      proofFile: leanArtifact.relativePath,
      requires: [],
      ensures: [
        ...machine.transitions.map((transition) => `${transition.from} + ${transition.action} -> ${transition.to}`),
        ...implicitSelfTransitions(machine).map((transition) => `${transition.state} + ${transition.action} -> ${transition.state}`),
        ...(machine.terminalStates ?? []).map((state) => `${state} is terminal`),
      ],
      theoremNames: leanArtifact.theoremNames.filter((theoremName) => theoremName.includes(`.${machine.name}_`)),
      status,
    })),
    ...module.stateMachines.map((machine) => ({
      exportName: stateMachineGuardName(machine),
      model: "TSCoreStateMachineGuard",
      proofFile: leanArtifact.relativePath,
      requires: [],
      ensures: [
        ...machine.transitions.map((transition) => `${transition.from} + ${transition.action} is allowed`),
        ...implicitSelfTransitions(machine).map((transition) => `${transition.state} + ${transition.action} is blocked`),
      ],
      theoremNames: leanArtifact.theoremNames.filter((theoremName) => theoremName.includes(`.${stateMachineGuardName(machine)}_`)),
      status,
    })),
  ] satisfies VerifiedExport[];

  const manifest: ProofManifest = {
    checker: "lean4",
    generatedAt: new Date().toISOString(),
    source: sourcePath,
    leanCheck,
    verifiedExports,
  };

  await writeTextFile(path.join(outDir, "proof-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Bip verify-core wrote ${path.join(outDir, "proof-manifest.json")}`);
  console.log(`Runtime TypeScript: ${runtimePath}`);
  console.log(`Lean proof: ${proofPath}`);
  console.log(`Lean check: ${leanCheck.status} - ${leanCheck.detail}`);

  if (leanCheck.status === "failed") {
    process.exitCode = 1;
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

function implicitSelfTransitions(machine: TSCoreModule["stateMachines"][number]): Array<{ state: string; action: string }> {
  const explicit = new Set(machine.transitions.map((transition) => `${transition.from}:${transition.action}`));
  return machine.states.flatMap((state) => {
    return machine.actions.flatMap((action) => {
      return explicit.has(`${state}:${action}`) ? [] : [{ state, action }];
    });
  });
}

function stateMachineGuardName(machine: TSCoreModule["stateMachines"][number]): string {
  return `can${machine.name.slice(0, 1).toUpperCase()}${machine.name.slice(1)}`;
}
