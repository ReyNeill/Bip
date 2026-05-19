import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractContracts } from "../contracts/extract.ts";
import type { ProofManifest, VerifiedExport } from "../contracts/types.ts";
import { checkLean } from "../lean/check.ts";
import { emitLeanArtifacts } from "../lean/emit.ts";
import { writeTextFile } from "../utils/fs.ts";

export type VerifyOptions = {
  sourcePath: string;
  outDir: string;
};

export async function verify(options: VerifyOptions): Promise<void> {
  const absoluteSourcePath = path.resolve(options.sourcePath);
  const sourcePath = path.relative(process.cwd(), absoluteSourcePath);
  const outDir = path.resolve(options.outDir);
  const sourceText = await readFile(absoluteSourcePath, "utf8");
  const contracts = extractContracts(sourcePath, sourceText);

  await mkdir(outDir, { recursive: true });

  const verifiedExports: VerifiedExport[] = [];
  const proofFiles: string[] = [];

  for (const contract of contracts) {
    const artifact = emitLeanArtifacts(contract);

    if (artifact.verifiedExport.proofFile) {
      const outputPath = path.join(outDir, artifact.relativePath);
      await writeTextFile(outputPath, artifact.content);
      proofFiles.push(outputPath);
    }

    verifiedExports.push(artifact.verifiedExport);
  }

  const leanCheck = await checkLean(proofFiles);
  const checkedExports = verifiedExports.map((verifiedExport) => {
    if (verifiedExport.status !== "generated") {
      return verifiedExport;
    }

    return {
      ...verifiedExport,
      status: leanCheck.status,
    } satisfies VerifiedExport;
  });

  const manifest: ProofManifest = {
    checker: "lean4",
    generatedAt: new Date().toISOString(),
    source: sourcePath,
    leanCheck,
    verifiedExports: checkedExports,
  };

  await writeTextFile(path.join(outDir, "proof-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  printSummary(manifest, outDir);

  if (leanCheck.status === "failed") {
    process.exitCode = 1;
  }
}

function printSummary(manifest: ProofManifest, outDir: string): void {
  console.log(`Bip verify wrote ${path.join(outDir, "proof-manifest.json")}`);
  console.log(`Lean check: ${manifest.leanCheck.status} - ${manifest.leanCheck.detail}`);

  for (const verifiedExport of manifest.verifiedExports) {
    console.log(`- ${verifiedExport.exportName}: ${verifiedExport.status}`);
  }
}
