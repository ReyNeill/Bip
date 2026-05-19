import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ProofManifest } from "../contracts/types.ts";
import { loadBipConfig } from "../config/load.ts";
import type { BipModuleConfig, BipScanCheck } from "../config/types.ts";

type FindingSeverity = "error" | "warn" | "info";

type Finding = {
  category: string;
  ruleId: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  recommendation: string;
  location?: string;
  affectedCount?: number;
};

type ScoreItem = {
  category: string;
  name: string;
  weight: number;
  earned: number;
};

export async function scanProject(rootPath: string): Promise<void> {
  const startedAt = Date.now();
  const root = path.resolve(rootPath);
  const loaded = await loadOptionalBipConfig(root);
  const config = loaded?.config ?? { modules: [] };
  const packageInfo = readPackageInfo(root);
  const sourceFiles = collectSourceFiles(root);
  const findings: Finding[] = [];
  const scores: ScoreItem[] = [];

  console.log("bip scan v0.0.0");
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

function discoverBoundaries(root: string, sourceFiles: string[], findings: Finding[], scores: ScoreItem[]): void {
  const readableFiles = sourceFiles
    .filter((filePath) => !filePath.includes(`${path.sep}src${path.sep}generated${path.sep}`))
    .filter((filePath) => !filePath.includes(`${path.sep}generated${path.sep}`))
    .map((filePath) => ({
      filePath,
      relativePath: relative(root, filePath),
      content: readFileSync(filePath, "utf8"),
    }));

  inspectBoundaryGroup({
    name: "Site metadata",
    weight: 8,
    files: readableFiles.filter((file) => isSiteMetadata(file.relativePath, file.content)),
    covered: (content) => isBipBacked(content),
    detail: "Page titles, descriptions, OpenGraph data, and social image metadata are good low-friction proof seeds.",
    recommendation: "Move stable metadata into a Bip TSCore module and render through generated helpers.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "Navigation and links",
    weight: 8,
    files: readableFiles.filter((file) => isNavigationOrLinks(file.relativePath, file.content)),
    covered: (content) => isBipBacked(content),
    detail: "Navigation and external links should preserve stable labels, href formats, and uniqueness.",
    recommendation: "Move route, nav, and social link catalogs into Bip constants with field and prefix contracts.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "Content catalogs",
    weight: 8,
    files: readableFiles.filter((file) => isContentCatalog(file.relativePath, file.content)),
    covered: (content) => isBipBacked(content),
    detail: "Track lists, project lists, and other repeated content should keep identity and shape invariants.",
    recommendation: "Move repeated content arrays into Bip constants with uniqueness and non-empty field contracts.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "API contracts",
    weight: 20,
    files: readableFiles.filter((file) => /src\/app\/api\/.*\/route\.(ts|tsx|js|jsx)$/.test(toPosix(file.relativePath)) && /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/.test(file.content)),
    covered: (content) => isBipBacked(content),
    detail: "API route handlers should have proof-backed request/response contracts.",
    recommendation: "Move request validation, response unions, or path constructors into a Bip TSCore module.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "Auth and permissions",
    weight: 20,
    files: readableFiles.filter((file) => /(clerkMiddleware|currentUser|auth\(|ADMIN_EMAIL|ADMIN_USER|ADMIN_PASS|hasPermission|canAccess)/.test(file.content)),
    covered: (content) => isBipBacked(content) && /(can[A-Z]\w+Transition|is[A-Z]\w+\(|Permission|Role|Access)/.test(content),
    detail: "Auth and permission branches are high-risk control boundaries.",
    recommendation: "Model roles, protected routes, and allow/deny decisions as Bip predicates or state machines.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "Reducers and state",
    weight: 15,
    files: readableFiles
      .filter((file) => !file.relativePath.includes("src/components/ui/"))
      .filter((file) => /(useReducer|function\s+\w*Reducer|const\s+\w*Reducer|=>\s*state)/.test(file.content)),
    covered: (content) => isBipBacked(content) && /(can[A-Z]\w+Transition|Transition\(|dispatch\()/m.test(content),
    detail: "Reducers and local state machines should preserve explicit invariants.",
    recommendation: "Back domain reducers with a Bip state machine and drive UI guards from generated helpers.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "External IO",
    weight: 15,
    files: readableFiles.filter((file) => /(fetch\(|process\.env\.(?!(NODE_ENV|NEXT_PUBLIC_|VERCEL_URL\b|VERCEL_PROJECT_PRODUCTION_URL\b))|GitHub|stripe|supabase|convex|prisma|createClient)/i.test(file.content)),
    covered: (content) => isBipBacked(content) && /(Payload|Result|Success|Error|is[A-Z]\w+\()/m.test(content),
    detail: "Network, environment, database, and service boundaries should have explicit contracts.",
    recommendation: "Wrap external inputs and outputs with Bip constructors, predicates, or schemas before use.",
    findings,
    scores,
  });

  inspectBoundaryGroup({
    name: "Runtime schemas",
    weight: 10,
    files: readableFiles.filter((file) => /(z\.object|\bschema\s*=|safeParse\()/m.test(file.content)),
    covered: (content) => isBipBacked(content),
    detail: "Runtime schemas are natural proof boundary seeds.",
    recommendation: "Mirror important runtime schemas in TSCore so validated shapes also get Lean-checked contracts.",
    findings,
    scores,
  });
}

type BoundaryGroup = {
  name: string;
  weight: number;
  files: Array<{ relativePath: string; content: string }>;
  covered: (content: string) => boolean;
  detail: string;
  recommendation: string;
  findings: Finding[];
  scores: ScoreItem[];
};

function inspectBoundaryGroup(group: BoundaryGroup): void {
  if (group.files.length === 0) {
    return;
  }

  const covered = group.files.filter((file) => group.covered(file.content));
  const uncovered = group.files.filter((file) => !group.covered(file.content));
  const earned = Math.round(group.weight * (covered.length / group.files.length));

  group.scores.push({
    category: "Discovered Boundaries",
    name: group.name,
    weight: group.weight,
    earned,
  });

  if (uncovered.length === 0) {
    return;
  }

  const examples = uncovered.slice(0, 3).map((file) => locationForBoundary(file)).join(", ");
  const remaining = uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : "";
  const discoveredLabel = group.files.length === 1 ? "discovered file lacks" : "discovered files lack";

  group.findings.push({
    category: "Discovered Boundaries",
    ruleId: `bip/${slugify(group.name)}`,
    severity: "warn",
    title: `${group.name} not fully proof-backed`,
    detail: `${uncovered.length}/${group.files.length} ${discoveredLabel} a visible Bip boundary. ${group.detail}`,
    recommendation: group.recommendation,
    location: `${examples}${remaining}`,
    affectedCount: uncovered.length,
  });
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

  const moduleFindings = findings.slice(findingStart);
  const hasError = moduleFindings.some((finding) => finding.severity === "error");
  const hasWarning = moduleFindings.some((finding) => finding.severity === "warn");
  score.earned = hasError ? 0 : hasWarning ? Math.round(weight * 0.5) : weight;
  scores.push(score);
}

function runConfiguredCheck(root: string, check: BipScanCheck, findings: Finding[], scores: ScoreItem[]): void {
  const category = check.category ?? "Project Checks";
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

function totalAffectedCount(findings: Finding[]): number {
  return findings.reduce((sum, finding) => sum + affectedCount(finding), 0);
}

function printScore(scores: ScoreItem[], findings: Finding[], elapsedMs: number): void {
  const total = scores.reduce((sum, item) => sum + item.weight, 0);
  const earned = scores.reduce((sum, item) => sum + item.earned, 0);
  const checkedModules = scores.filter((item) => item.category !== "Project Checks" && item.category !== "Discovered Boundaries" && item.earned === item.weight).length;
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

function isBipBacked(content: string): boolean {
  return content.includes("generated/bip") || content.includes("from \"bip\"") || content.includes("from 'bip'");
}

function isSiteMetadata(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  return /export\s+const\s+metadata\b/.test(content) || /socialImage(Alt|Size)|siteTitle|siteDescription/.test(content);
}

function isNavigationOrLinks(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  return (
    /const\s+\w*(nav|link|social|route|page)\w*\s*=\s*\[/i.test(content) ||
    /export\s+const\s+\w*(nav|link|social|route|page)\w*\s*[:=]/i.test(content)
  );
}

function isContentCatalog(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  if (/chart|analytics|table/i.test(relativePath)) {
    return false;
  }

  const catalogPattern = /(const|export\s+const)\s+(\w*(track|project|post|catalog|album|tour|show|date)\w*)\s*[:=]/i;
  const match = content.match(catalogPattern);

  return Boolean(match && !/(nav|link|social|route|page)/i.test(match[2] ?? ""));
}

function locationForBoundary(file: { relativePath: string; content: string }): string {
  const lines = file.content.split("\n");
  const lineIndex = lines.findIndex((line) =>
    /export\s+const\s+metadata\b|const\s+\w+\s*=\s*\[|export\s+const\s+\w+\s*[:=]|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|useReducer|currentUser|clerkMiddleware|fetch\(|process\.env|z\.object|\bschema\s*=/.test(line),
  );

  return lineIndex >= 0 ? `${file.relativePath}:${lineIndex + 1}` : file.relativePath;
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath);
}
