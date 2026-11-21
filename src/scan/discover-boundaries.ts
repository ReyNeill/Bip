import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding } from "./types.ts";

type ReadableSourceFile = {
  filePath: string;
  relativePath: string;
  content: string;
};

type BoundaryRule = {
  name: string;
  matches: (file: ReadableSourceFile) => boolean;
  detail: string;
  recommendation: string;
};

// Advisory discovery: lists files that look like proof candidates and do not import generated Bip
// code yet. Matching is heuristic, so findings are `info` and never affect the score.
export function discoverBoundaries(
  root: string,
  sourceFiles: string[],
  findings: Finding[],
  category: string,
): void {
  const readableFiles = sourceFiles
    .filter((filePath) => !filePath.includes(`${path.sep}bip${path.sep}`))
    .filter((filePath) => !filePath.includes(`${path.sep}src${path.sep}generated${path.sep}`))
    .filter((filePath) => !filePath.includes(`${path.sep}generated${path.sep}`))
    .filter((filePath) => !filePath.includes(".tscore."))
    .map((filePath) => ({
      filePath,
      relativePath: relative(root, filePath),
      content: readFileSync(filePath, "utf8"),
    }))
    .filter((file) => !isScannerImplementation(file.relativePath, file.content));

  for (const rule of boundaryRules) {
    const uncovered = readableFiles.filter(
      (file) => rule.matches(file) && !isBipBacked(file.content),
    );

    if (uncovered.length > 0) {
      findings.push(boundaryFinding(rule, uncovered, category));
    }
  }
}

const boundaryRules: BoundaryRule[] = [
  {
    name: "Site metadata",
    matches: (file) => isSiteMetadata(file.relativePath, file.content),
    detail:
      "Page titles, descriptions, OpenGraph data, and social image metadata are good low-friction proof seeds.",
    recommendation:
      "Move stable metadata into a Bip constant with field contracts and render from the generated data.",
  },
  {
    name: "Navigation and links",
    matches: (file) => isNavigationOrLinks(file.relativePath, file.content),
    detail:
      "Navigation and external links should preserve stable labels, href formats, and uniqueness.",
    recommendation:
      "Move route, nav, and social link catalogs into Bip constants with field and prefix contracts.",
  },
  {
    name: "Content catalogs",
    matches: (file) => isContentCatalog(file.relativePath, file.content),
    detail:
      "Track lists, project lists, and other repeated content should keep identity and shape invariants.",
    recommendation:
      "Move repeated content arrays into Bip constants with uniqueness and non-empty field contracts.",
  },
  {
    name: "API contracts",
    matches: (file) =>
      /src\/app\/api\/.*\/route\.(ts|tsx|js|jsx)$/.test(toPosix(file.relativePath)) &&
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/.test(file.content),
    detail: "API route handlers should have proof-backed request/response contracts.",
    recommendation:
      "Move request validation predicates, response unions, or path builders with prefix/suffix contracts into a Bip TSCore module.",
  },
  {
    name: "Auth and permissions",
    matches: (file) =>
      /(clerkMiddleware|currentUser|auth\(|ADMIN_EMAIL|ADMIN_USER|ADMIN_PASS|hasPermission|canAccess)/.test(
        file.content,
      ),
    detail: "Auth and permission branches are high-risk control boundaries.",
    recommendation:
      "Model roles, protected routes, and allow/deny decisions as Bip predicates or state machines.",
  },
  {
    name: "Reducers and state",
    matches: (file) => isReducerOrStateBoundary(file.relativePath, file.content),
    detail: "Reducers and local state machines should preserve explicit invariants.",
    recommendation:
      "Back domain reducers with a Bip state machine and drive UI guards from generated helpers.",
  },
  {
    name: "External IO",
    matches: (file) =>
      /(fetch\(|process\.env\.(?!(NODE_ENV|NEXT_PUBLIC_|VERCEL_URL\b|VERCEL_PROJECT_PRODUCTION_URL\b))|GitHub|stripe|supabase|convex|prisma|createClient)/i.test(
        file.content,
      ),
    detail:
      "Network, environment, database, and service boundaries should have explicit contracts.",
    recommendation:
      "Check external inputs with Bip predicates (for example nonEmptyFieldsPredicate) before use.",
  },
  {
    name: "Runtime schemas",
    matches: (file) => /(z\.object|\bschema\s*=|safeParse\()/m.test(file.content),
    detail: "Runtime schemas are natural proof boundary seeds.",
    recommendation:
      "Mirror important runtime schemas in TSCore so validated shapes also get Lean-checked contracts.",
  },
];

function boundaryFinding(
  rule: BoundaryRule,
  files: ReadableSourceFile[],
  category: string,
): Finding {
  const examples = files
    .slice(0, 3)
    .map((file) => locationForBoundary(file))
    .join(", ");
  const remaining = files.length > 3 ? ` and ${files.length - 3} more` : "";

  return {
    category,
    ruleId: `bip/${slugify(rule.name)}`,
    severity: "info",
    title: `${rule.name} candidates`,
    detail: `${files.length} file${files.length === 1 ? "" : "s"} without generated Bip code. ${rule.detail}`,
    recommendation: rule.recommendation,
    location: `${examples}${remaining}`,
    affectedCount: files.length,
  };
}

function isBipBacked(content: string): boolean {
  return (
    content.includes("generated/bip") ||
    content.includes('from "bip"') ||
    content.includes("from 'bip'")
  );
}

function isSiteMetadata(relativePath: string, content: string): boolean {
  if (relativePath.includes("src/components/ui/")) {
    return false;
  }

  return (
    /export\s+const\s+metadata\b/.test(content) ||
    /socialImage(Alt|Size)|siteTitle|siteDescription/.test(content)
  );
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
  return declaredConstNames(content).some((name) =>
    identifierTokens(name).some((token) => navigationTokens.has(token)),
  );
}

function hasJsxLinks(relativePath: string, content: string): boolean {
  if (!/\.(tsx|jsx)$/.test(relativePath)) {
    return false;
  }

  return /<(Link|a)\s+[^>]*href\s*=/.test(content);
}

function hasImperativeNavigation(content: string): boolean {
  return (
    /\b(router|navigation)\.(push|replace)\s*\(\s*["'`/]/.test(content) ||
    /\bredirect\s*\(\s*["'`/]/.test(content)
  );
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
    return (
      tokens.some((token) => contentCatalogTokens.has(token)) &&
      !tokens.some((token) => navigationTokens.has(token))
    );
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
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''");
}

const contentCatalogTokens = new Set([
  "track",
  "tracks",
  "project",
  "projects",
  "post",
  "posts",
  "catalog",
  "catalogs",
  "album",
  "albums",
  "tour",
  "tours",
  "show",
  "shows",
  "date",
  "dates",
]);
const navigationTokens = new Set([
  "nav",
  "navigation",
  "link",
  "links",
  "social",
  "route",
  "routes",
  "page",
  "pages",
]);

function declaredArrayConstNames(content: string): string[] {
  return [
    ...content.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\[/g),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

function declaredConstNames(content: string): string[] {
  return [
    ...content.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

function identifierTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function isScannerImplementation(relativePath: string, content: string): boolean {
  return (
    toPosix(relativePath) === "src/scan/discover-boundaries.ts" &&
    content.includes("const boundaryRules")
  );
}

function locationForBoundary(file: { relativePath: string; content: string }): string {
  const lines = file.content.split("\n");
  const lineIndex = lines.findIndex((line) =>
    /export\s+const\s+metadata\b|const\s+\w+\s*[:=]|export\s+const\s+\w+\s*[:=]|<Link\s+[^>]*href\s*=|<a\s+[^>]*href\s*=|\b(router|navigation)\.(push|replace)\s*\(|\bredirect\s*\(|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|useReducer|currentUser|clerkMiddleware|fetch\(|process\.env|z\.object|\bschema\s*=/.test(
      line,
    ),
  );

  return lineIndex >= 0 ? `${file.relativePath}:${lineIndex + 1}` : file.relativePath;
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath);
}
