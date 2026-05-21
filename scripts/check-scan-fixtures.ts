import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject } from "../src/commands/scan.ts";

type FixtureFile = {
  path: string;
  content: string;
};

await withFixture(
  "reports uncovered discovery findings",
  [
    packageFile(),
    {
      path: "src/navigation.ts",
      content: source(["export const ", "nav", "Links = [{ href: \"/\", label: \"Home\" }];\n"]),
    },
    {
      path: "src/app/api/status/route.ts",
      content: `export async function GET() {\n  return Response.json({ ok: true });\n}\n`,
    },
    {
      path: "src/auth.ts",
      content: source(["export async function readUser() {\n  return ", "current", "User();\n}\n"]),
    },
    {
      path: "src/schema.ts",
      content: source(["const ", "schema", " = ", "z", ".object({ slug: z.string() });\n"]),
    },
    {
      path: "src/projects.ts",
      content: source(["export const ", "project", "Catalog = [{ slug: \"bip\" }];\n"]),
    },
  ],
  async (root) => {
    const output = await captureScan(root);

    assertIncludes(output, "Discovered Boundaries 5 issues");
    assertIncludes(output, "Rule: bip/api-contracts");
    assertIncludes(output, "Rule: bip/auth-and-permissions");
    assertIncludes(output, "Rule: bip/content-catalogs");
    assertIncludes(output, "Rule: bip/navigation-and-links");
    assertIncludes(output, "Rule: bip/runtime-schemas");
    assertIncludes(output, "src/projects.ts:1");
    assertIncludes(output, "src/navigation.ts:1");
    assertIncludes(output, "src/app/api/status/route.ts:1");
    assertIncludes(output, "Bip Verification Score:");
  },
);

await withFixture(
  "detects route maps, JSX links, and imperative navigation",
  [
    packageFile(),
    {
      path: "src/routes.ts",
      content: source(["export const ", "route", "Map = { home: \"/\", writing: \"/writing\" };\n"]),
    },
    {
      path: "src/app/page.tsx",
      content: `import Link from "next/link";\n\nexport default function Page() {\n  return <Link href="/writing">Writing</Link>;\n}\n`,
    },
    {
      path: "src/app/actions.ts",
      content: source(["import { ", "redirect", " } from \"next/navigation\";\n\nexport function goToDashboard() {\n  ", "redirect", "(\"/dashboard\");\n}\n"]),
    },
  ],
  async (root) => {
    const output = await captureScan(root);

    assertIncludes(output, "Discovered Boundaries 1 issue");
    assertIncludes(output, "Navigation and links not fully proof-backed ×3");
    assertIncludes(output, "3/3 discovered files lack a visible Bip boundary.");
    assertIncludes(output, "src/routes.ts:1");
    assertIncludes(output, "src/app/page.tsx:4");
    assertIncludes(output, "src/app/actions.ts:4");
  },
);

await withFixture(
  "ignores known false-positive paths and allowed public env reads",
  [
    packageFile(),
    {
      path: "src/components/ui/button.tsx",
      content: source(["export const ", "nav", "Links = [{ href: \"/\", label: \"Home\" }];\n"]),
    },
    {
      path: "generated/api.ts",
      content: source(["export async function loadGenerated() {\n  return ", "fetch", "(\"/api/generated\");\n}\n"]),
    },
    {
      path: "src/generated/auth.ts",
      content: source(["export async function generatedAuth() {\n  return ", "current", "User();\n}\n"]),
    },
    {
      path: "src/env.ts",
      content: `export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;\n`,
    },
    {
      path: "src/charts/table.ts",
      content: source(["export const analytics", "Projects = [{ name: \"Revenue\" }];\n"]),
    },
    {
      path: "src/config/load.ts",
      content: `const candidate = "bip.config.ts";\nconst pathCandidates = ["lean"];\nconst catalogPattern = /catalog/;\n`,
    },
    {
      path: "src/scan/discover-boundaries.ts",
      content: source(["const boundaryRules = [/(", "current", "User|", "fetch", "\\(|=>\\s*state)/];\n"]),
    },
    {
      path: "src/components/ui/link.tsx",
      content: `<a href="/">Home</a>;\n`,
    },
  ],
  async (root) => {
    const output = await captureScan(root);

    assertIncludes(output, "No verification issues found.");
    assertIncludes(output, "Bip Verification Score: unavailable");
    assertExcludes(output, "Rule: bip/navigation-and-links");
    assertExcludes(output, "Rule: bip/content-catalogs");
    assertExcludes(output, "Rule: bip/auth-and-permissions");
    assertExcludes(output, "Rule: bip/external-io");
  },
);

console.log("Scan fixture tests passed.");

async function withFixture(name: string, files: FixtureFile[], run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "bip-scan-"));

  try {
    for (const file of files) {
      const filePath = path.join(root, file.path);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content, "utf8");
    }

    await run(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} failed:\n${message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function captureScan(root: string): Promise<string> {
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const lines: string[] = [];

  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  try {
    process.exitCode = undefined;
    await scanProject(root);
    return lines.join("\n");
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
}

function packageFile(): FixtureFile {
  return {
    path: "package.json",
    content: JSON.stringify({ devDependencies: { typescript: "^5.9.3" } }),
  };
}

function source(parts: string[]): string {
  return parts.join("");
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected output to include '${expected}'.\n\nActual output:\n${value}`);
  }
}

function assertExcludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) {
    throw new Error(`Expected output to exclude '${unexpected}'.\n\nActual output:\n${value}`);
  }
}
