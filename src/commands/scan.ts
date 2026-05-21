import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ProofManifest } from "../contracts/types.ts";
import { loadBipConfig } from "../config/load.ts";
import type { BipModuleConfig, BipScanCheck } from "../config/types.ts";
import { discoverBoundaries } from "../scan/discover-boundaries.ts";
import type { Finding, FindingSeverity, ScoreItem } from "../scan/types.ts";
import {
  builtInScanCategories,
  scanCategoryName,
  scanGateStatusTransition,
  type ScanFindingSignal,
  type ScanGateStatus,
} from "../generated/bip/runtime/ScanScoring.ts";
import { readPackageVersion } from "../version.ts";

const [projectChecksCategory, discoveredBoundariesCategory] = builtInScanCategories;

if (!projectChecksCategory || !discoveredBoundariesCategory) {
  throw new Error("Generated Bip scan categories are missing.");
}

const PROJECT_CHECKS_CATEGORY = scanCategoryName(projectChecksCategory);
const DISCOVERED_BOUNDARIES_CATEGORY = scanCategoryName(discoveredBoundariesCategory);

export async function scanProject(rootPath: string): Promise<void> {
  const startedAt = Date.now();
  const root = path.resolve(rootPath);
  const loaded = await loadOptionalBipConfig(root);
  const config = loaded?.config ?? { modules: [] };
  const packageInfo = readPackageInfo(root);
  const sourceFiles = collectSourceFiles(root);
  const findings: Finding[] = [];
  const scores: ScoreItem[] = [];

  console.log(`bip scan v${readPackageVersion()}`);
  console.log("");
  console.log(`Scanning ${root}...`);
  console.log("");
  console.log(loaded ? `- Config. Found ${path.relative(root, loaded.path)}.` : "- Config. Not found. Running discovery-only scan.");
  console.log(`- Framework. ${packageInfo.framework}.`);
  console.log(`- Language. ${packageInfo.language}.`);
  console.log(`- Found ${sourceFiles.length} source files.`);
  console.log(`- Found ${config.modules.length} Bip module${config.modules.length === 1 ? "" : "s"}.`);
  console.log("");

  for (const moduleConfig of config.modules) {
    inspectModule(root, moduleConfig, findings, scores);
  }

  for (const check of config.checks ?? []) {
    runConfiguredCheck(root, check, findings, scores);
  }

  discoverBoundaries(root, sourceFiles, findings, scores);

  printFindings(findings);
  printScore(scores, findings, Date.now() - startedAt);

  if (findings.some((finding) => finding.severity === "error")) {
    process.exitCode = 1;
  }
}

async function loadOptionalBipConfig(root: string): Promise<Awaited<ReturnType<typeof loadBipConfig>> | null> {
  try {
    return await loadBipConfig(root);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No Bip config found")) {
      return null;
    }

    throw error;
  }
}

function inspectModule(root: string, moduleConfig: BipModuleConfig, findings: Finding[], scores: ScoreItem[]): void {
  const category = moduleConfig.category ?? "Proof Modules";
  const weight = moduleConfig.weight ?? 10;
  const sourcePath = path.resolve(root, moduleConfig.source);
  const outDir = path.resolve(root, moduleConfig.outDir);
  const manifestPath = path.join(outDir, "proof-manifest.json");
  const relativeSource = relative(root, sourcePath);
  const score: ScoreItem = { category, name: moduleConfig.name, weight, earned: 0 };
  const findingStart = findings.length;

  if (!existsSync(sourcePath)) {
    findings.push({
      category,
      ruleId: "bip/missing-tscore-source",
      severity: "error",
      title: "Missing TSCore source",
      detail: `Configured module '${moduleConfig.name}' points at a missing source file.`,
      recommendation: "Create the TSCore module or update bip.config.ts.",
      location: relativeSource,
    });
    scores.push(score);
    return;
  }

  if (!existsSync(manifestPath)) {
    findings.push({
      category,
      ruleId: "bip/missing-proof-manifest",
      severity: "error",
      title: "Missing proof manifest",
      detail: `Configured module '${moduleConfig.name}' has no generated proof manifest.`,
      recommendation: "Run `bunx bip verify` to generate runtime TypeScript and Lean proofs.",
      location: relative(root, manifestPath),
    });
    scores.push(score);
    return;
  }

  const manifest = readManifest(manifestPath);
  const proofPath = manifest.verifiedExports[0]?.proofFile ? path.join(outDir, manifest.verifiedExports[0].proofFile) : null;

  if (manifest.leanCheck.status !== "checked") {
    findings.push({
      category,
      ruleId: "bip/lean-proof-not-checked",
      severity: "error",
      title: "Lean proof not checked",
      detail: `Module '${moduleConfig.name}' reports Lean status '${manifest.leanCheck.status}'.`,
      recommendation: "Install Lean with elan or fix the generated proof errors before trusting this module.",
      location: relative(root, manifestPath),
    });
  }

  if (manifest.verifiedExports.length === 0) {
    findings.push({
      category,
      ruleId: "bip/no-verified-exports",
      severity: "warn",
      title: "No verified exports",
      detail: `Module '${moduleConfig.name}' has a manifest but no verified exports.`,
      recommendation: "Add constants, functions, or state machines with contracts to the TSCore module.",
      location: relative(root, manifestPath),
    });
  }

  const uncheckedExport = manifest.verifiedExports.find((item) => item.status !== "checked");

  if (uncheckedExport) {
    findings.push({
      category,
      ruleId: "bip/unchecked-export",
      severity: "error",
      title: "Unchecked export",
      detail: `Export '${uncheckedExport.exportName}' is '${uncheckedExport.status}', not checked.`,
      recommendation: "Regenerate the module and resolve the failing Lean proof or missing model.",
      location: relative(root, manifestPath),
    });
  }

  if (proofPath && !existsSync(proofPath)) {
    findings.push({
      category,
      ruleId: "bip/missing-lean-proof-file",
      severity: "error",
      title: "Missing Lean proof file",
      detail: `Module '${moduleConfig.name}' references a proof file that does not exist.`,
      recommendation: "Regenerate the module so the manifest and proof files match.",
      location: relative(root, proofPath),
    });
  }

  if (statSync(sourcePath).mtimeMs > statSync(manifestPath).mtimeMs) {
    findings.push({
      category,
      ruleId: "bip/stale-proof-manifest",
      severity: "warn",
      title: "TSCore source newer than manifest",
      detail: `Module '${moduleConfig.name}' changed after its proof manifest was generated.`,
      recommendation: "Run `bunx bip verify` to refresh generated artifacts.",
      location: relativeSource,
    });
  }

  const status = scoreGateStatus(findings.slice(findingStart));
  score.earned = status === "error" ? 0 : status === "warn" ? Math.round(weight * 0.5) : weight;
  scores.push(score);
}

function runConfiguredCheck(root: string, check: BipScanCheck, findings: Finding[], scores: ScoreItem[]): void {
  const category = check.category ?? PROJECT_CHECKS_CATEGORY;
  const weight = check.weight ?? 10;
  const [command, ...args] = check.command;

  if (!command) {
    findings.push({
      category,
      ruleId: "bip/empty-check-command",
      severity: "warn",
      title: "Empty check command",
      detail: `Configured check '${check.name}' has no command.`,
      recommendation: "Add a command array such as [\"bun\", \"scripts/check-bip-generated.ts\"].",
    });
    scores.push({ category, name: check.name, weight, earned: 0 });
    return;
  }

  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode === 0) {
    scores.push({ category, name: check.name, weight, earned: weight });
    return;
  }

  findings.push({
    category,
    ruleId: "bip/configured-check-failed",
    severity: "error",
    title: "Configured check failed",
    detail: `Check '${check.name}' exited with code ${result.exitCode}.`,
    recommendation: "Run the check command directly, fix the reported issue, then run `bunx bip scan` again.",
    location: check.command.join(" "),
  });
  scores.push({ category, name: check.name, weight, earned: 0 });
}

function printFindings(findings: Finding[]): void {
  const grouped = new Map<string, Finding[]>();
  const sortedFindings = dedupeFindings(findings).toSorted(compareFindings);

  for (const finding of sortedFindings) {
    grouped.set(finding.category, [...(grouped.get(finding.category) ?? []), finding]);
  }

  if (findings.length === 0) {
    console.log("No verification issues found.");
    console.log("");
    return;
  }

  for (const [category, items] of [...grouped.entries()].toSorted(compareCategoryGroups)) {
    console.log(`${category} ${items.length} issue${items.length === 1 ? "" : "s"}`);

    for (const item of items) {
      const marker = item.severity === "error" ? "✖" : item.severity === "warn" ? "⚠" : "ℹ";
      const affectedLabel = item.affectedCount && item.affectedCount > 1 ? ` ×${item.affectedCount}` : "";
      console.log(`  ${marker} ${item.title}${affectedLabel}`);
      console.log(`    Rule: ${item.ruleId}`);
      console.log(`    ${item.detail}`);
      console.log(`    ${item.recommendation}`);

      if (item.location) {
        console.log(`    ${item.location}`);
      }
    }

    console.log("");
  }
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const finding of findings) {
    const key = [finding.ruleId, finding.location ?? "", finding.detail].join("\0");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function compareCategoryGroups([categoryA, itemsA]: [string, Finding[]], [categoryB, itemsB]: [string, Finding[]]): number {
  const severityDelta = severityRank(worstSeverity(itemsA)) - severityRank(worstSeverity(itemsB));

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const impactDelta = totalAffectedCount(itemsB) - totalAffectedCount(itemsA);

  if (impactDelta !== 0) {
    return impactDelta;
  }

  return categoryA.localeCompare(categoryB);
}

function compareFindings(a: Finding, b: Finding): number {
  const severityDelta = severityRank(a.severity) - severityRank(b.severity);

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const impactDelta = affectedCount(b) - affectedCount(a);

  if (impactDelta !== 0) {
    return impactDelta;
  }

  return a.ruleId.localeCompare(b.ruleId);
}

function worstSeverity(findings: Finding[]): FindingSeverity {
  if (findings.some((finding) => finding.severity === "error")) {
    return "error";
  }

  if (findings.some((finding) => finding.severity === "warn")) {
    return "warn";
  }

  return "info";
}

function severityRank(severity: FindingSeverity): number {
  return severity === "error" ? 0 : severity === "warn" ? 1 : 2;
}

function affectedCount(finding: Finding): number {
  return finding.affectedCount ?? 1;
}

function scoreGateStatus(findings: Finding[]): ScanGateStatus {
  let status: ScanGateStatus = "clean";

  for (const finding of findings) {
    status = scanGateStatusTransition(status, severitySignal(finding.severity));
  }

  return status;
}

function severitySignal(severity: FindingSeverity): ScanFindingSignal {
  return severity === "error" ? "observeError" : severity === "warn" ? "observeWarn" : "observeInfo";
}

function totalAffectedCount(findings: Finding[]): number {
  return findings.reduce((sum, finding) => sum + affectedCount(finding), 0);
}

function printScore(scores: ScoreItem[], findings: Finding[], elapsedMs: number): void {
  const total = scores.reduce((sum, item) => sum + item.weight, 0);
  const earned = scores.reduce((sum, item) => sum + item.earned, 0);
  const checkedModules = scores.filter(
    (item) => item.category !== PROJECT_CHECKS_CATEGORY && item.category !== DISCOVERED_BOUNDARIES_CATEGORY && item.earned === item.weight,
  ).length;
  const issueCount = findings.length;

  if (total === 0) {
    console.log("  Bip Verification Score: unavailable");
  } else {
    console.log(`  Bip Verification Score: ${Math.round((earned / total) * 100)} / 100`);
  }

  console.log("");
  console.log(`  ${issueCount} issue${issueCount === 1 ? "" : "s"} across ${scores.length} verification gate${scores.length === 1 ? "" : "s"} in ${elapsedMs}ms`);
  console.log(`  ${checkedModules} proof module${checkedModules === 1 ? "" : "s"} currently checked`);
}

function readManifest(manifestPath: string): ProofManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ProofManifest;
}

function readPackageInfo(root: string): { framework: string; language: string } {
  const packagePath = path.join(root, "package.json");

  if (!existsSync(packagePath)) {
    return { framework: "No package.json found", language: "Unknown" };
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (dependencies.next) {
    return { framework: `Next.js ${dependencies.next}`, language: dependencies.typescript ? "TypeScript" : "JavaScript" };
  }

  if (dependencies.react) {
    return { framework: `React ${dependencies.react}`, language: dependencies.typescript ? "TypeScript" : "JavaScript" };
  }

  return { framework: "Unknown", language: dependencies.typescript ? "TypeScript" : "JavaScript" };
}

function collectSourceFiles(root: string): string[] {
  const ignored = new Set([".git", ".next", "node_modules", "dist", "build", "coverage"]);
  const files: string[] = [];

  walk(root);
  return files;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath);
}
