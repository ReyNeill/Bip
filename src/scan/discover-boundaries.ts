import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding, ScoreItem } from "./types.ts";

type ReadableSourceFile = {
  filePath: string;
  relativePath: string;
  content: string;
};

type BoundaryRule = {
  name: string;
  weight: number;
  matches: (file: ReadableSourceFile) => boolean;
  covered: (content: string) => boolean;
  detail: string;
  recommendation: string;
};

type BoundaryGroup = BoundaryRule & {
  files: ReadableSourceFile[];
  findings: Finding[];
  scores: ScoreItem[];
};

export function discoverBoundaries(root: string, sourceFiles: string[], findings: Finding[], scores: ScoreItem[]): void {
  const readableFiles = sourceFiles
    .filter((filePath) => !filePath.includes(`${path.sep}bip${path.sep}`))
    .filter((filePath) => !filePath.includes(`${path.sep}src${path.sep}generated${path.sep}`))
    .filter((filePath) => !filePath.includes(`${path.sep}generated${path.sep}`))
    .map((filePath) => ({
      filePath,
      relativePath: relative(root, filePath),
      content: readFileSync(filePath, "utf8"),
    }))
    .filter((file) => !isScannerImplementation(file.relativePath, file.content));

  for (const rule of boundaryRules) {
    inspectBoundaryGroup({
      ...rule,
      files: readableFiles.filter((file) => rule.matches(file)),
      findings,
      scores,
    });
  }
}

const boundaryRules: BoundaryRule[] = [
  {
    name: "Site metadata",
    weight: 8,
    matches: (file) => isSiteMetadata(file.relativePath, file.content),
    covered: (content) => isBipBacked(content),
    detail: "Page titles, descriptions, OpenGraph data, and social image metadata are good low-friction proof seeds.",
    recommendation: "Move stable metadata into a Bip TSCore module and render through generated helpers.",
  },
  {
    name: "Navigation and links",
    weight: 8,
    matches: (file) => isNavigationOrLinks(file.relativePath, file.content),
    covered: (content) => isBipBacked(content),
    detail: "Navigation and external links should preserve stable labels, href formats, and uniqueness.",
    recommendation: "Move route, nav, and social link catalogs into Bip constants with field and prefix contracts.",
  },
  {
    name: "Content catalogs",
    weight: 8,
    matches: (file) => isContentCatalog(file.relativePath, file.content),
    covered: (content) => isBipBacked(content),
    detail: "Track lists, project lists, and other repeated content should keep identity and shape invariants.",
    recommendation: "Move repeated content arrays into Bip constants with uniqueness and non-empty field contracts.",
  },
  {
    name: "API contracts",
    weight: 20,
    matches: (file) => /src\/app\/api\/.*\/route\.(ts|tsx|js|jsx)$/.test(toPosix(file.relativePath)) && /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/.test(file.content),
    covered: (content) => isBipBacked(content),
    detail: "API route handlers should have proof-backed request/response contracts.",
    recommendation: "Move request validation, response unions, or path constructors into a Bip TSCore module.",
  },
  {
    name: "Auth and permissions",
    weight: 20,
    matches: (file) => /(clerkMiddleware|currentUser|auth\(|ADMIN_EMAIL|ADMIN_USER|ADMIN_PASS|hasPermission|canAccess)/.test(file.content),
    covered: isAuthBoundaryCovered,
    detail: "Auth and permission branches are high-risk control boundaries.",
    recommendation: "Model roles, protected routes, and allow/deny decisions as Bip predicates or state machines.",
  },
  {
    name: "Reducers and state",
    weight: 15,
    matches: (file) => isReducerOrStateBoundary(file.relativePath, file.content),
    covered: (content) => isBipBacked(content) && /(can[A-Z]\w+Transition|Transition\(|dispatch\()/m.test(content),
    detail: "Reducers and local state machines should preserve explicit invariants.",
    recommendation: "Back domain reducers with a Bip state machine and drive UI guards from generated helpers.",
  },
  {
    name: "External IO",
    weight: 15,
    matches: (file) => /(fetch\(|process\.env\.(?!(NODE_ENV|NEXT_PUBLIC_|VERCEL_URL\b|VERCEL_PROJECT_PRODUCTION_URL\b))|GitHub|stripe|supabase|convex|prisma|createClient)/i.test(file.content),
    covered: isExternalBoundaryCovered,
    detail: "Network, environment, database, and service boundaries should have explicit contracts.",
    recommendation: "Wrap external inputs and outputs with Bip constructors, predicates, or schemas before use.",
  },
  {
    name: "Runtime schemas",
    weight: 10,
    matches: (file) => /(z\.object|\bschema\s*=|safeParse\()/m.test(file.content),
    covered: (content) => isBipBacked(content),
    detail: "Runtime schemas are natural proof boundary seeds.",
    recommendation: "Mirror important runtime schemas in TSCore so validated shapes also get Lean-checked contracts.",
  },
];

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

function isBipBacked(content: string): boolean {
  return content.includes("generated/bip") || content.includes("from \"bip\"") || content.includes("from 'bip'");
}

function isAuthBoundaryCovered(content: string): boolean {
  if (!isBipBacked(content)) {
    return false;
  }

  if (/clerkMiddleware|createRouteMatcher/.test(content)) {
    return /protectedRouteAccess/.test(content) && /protectedRouteAccessPath\(/.test(content);
  }

  if (/currentUser|ADMIN_EMAIL/.test(content)) {
    return /adminAccessEmail\(/.test(content) && /isAdminAccessEmail\(/.test(content);
  }

  if (/ADMIN_USER|ADMIN_PASS|Basic\s+realm|authorization/i.test(content)) {
    return /(Admin|Auth|Credential|Access)\w*\(/.test(content) && /is(Admin|Auth|Credential|Access)\w*\(/.test(content);
  }

  return /(can[A-Z]\w+Transition|is[A-Z]\w+\(|Permission|Role|Access)/.test(content);
}

function isExternalBoundaryCovered(content: string): boolean {
  if (!isBipBacked(content)) {
    return false;
  }

  if (/process\.env\.GITHUB_|api\.github\.com|GitHub/i.test(content)) {
    return /\w*GitHubPayload\(/.test(content) && /is\w*GitHubPayload\(/.test(content);
  }

  return /(Payload|Result|Success|Error|is[A-Z]\w+\()/m.test(content);
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
    hasNamedNavigationConstant(content) ||
    hasJsxLinks(relativePath, content) ||
    hasImperativeNavigation(content)
  );
}

function hasNamedNavigationConstant(content: string): boolean {
  return declaredConstNames(content).some((name) => identifierTokens(name).some((token) => navigationTokens.has(token)));
}

function hasJsxLinks(relativePath: string, content: string): boolean {
  if (!/\.(tsx|jsx)$/.test(relativePath)) {
    return false;
  }

  return /<(Link|a)\s+[^>]*href\s*=/.test(content);
}

function hasImperativeNavigation(content: string): boolean {
  return /\b(router|navigation)\.(push|replace)\s*\(\s*["'`/]/.test(content) || /\bredirect\s*\(\s*["'`/]/.test(content);
}

function isContentCatalog(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  if (/chart|analytics|table/i.test(relativePath)) {
    return false;
  }

  return declaredArrayConstNames(content).some((name) => {
    const tokens = identifierTokens(name);
    return tokens.some((token) => contentCatalogTokens.has(token)) && !tokens.some((token) => navigationTokens.has(token));
  });
}

function isReducerOrStateBoundary(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  const source = removeStringLiterals(content);
  return (
    /useReducer\b/.test(source) ||
    /function\s+(?!emit[A-Z])\w*Reducer\b/.test(source) ||
    /const\s+\w*Reducer\b/.test(source) ||
    /=>\s*state\b/.test(source)
  );
}

function removeStringLiterals(content: string): string {
  return content
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "\"\"")
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''");
}

const contentCatalogTokens = new Set(["track", "tracks", "project", "projects", "post", "posts", "catalog", "catalogs", "album", "albums", "tour", "tours", "show", "shows", "date", "dates"]);
const navigationTokens = new Set(["nav", "navigation", "link", "links", "social", "route", "routes", "page", "pages"]);

function declaredArrayConstNames(content: string): string[] {
  return [...content.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\[/g)].map((match) => match[1]).filter((name): name is string => Boolean(name));
}

function declaredConstNames(content: string): string[] {
  return [...content.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g)].map((match) => match[1]).filter((name): name is string => Boolean(name));
}

function identifierTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function isScannerImplementation(relativePath: string, content: string): boolean {
  return toPosix(relativePath) === "src/scan/discover-boundaries.ts" && content.includes("const boundaryRules");
}

function locationForBoundary(file: { relativePath: string; content: string }): string {
  const lines = file.content.split("\n");
  const lineIndex = lines.findIndex((line) =>
    /export\s+const\s+metadata\b|const\s+\w+\s*[:=]|export\s+const\s+\w+\s*[:=]|<Link\s+[^>]*href\s*=|<a\s+[^>]*href\s*=|\b(router|navigation)\.(push|replace)\s*\(|\bredirect\s*\(|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|useReducer|currentUser|clerkMiddleware|fetch\(|process\.env|z\.object|\bschema\s*=/.test(line),
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
