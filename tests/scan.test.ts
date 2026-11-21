import { expect, test } from "bun:test";
import { scanProject } from "../src/commands/scan.ts";
import { captureOutput, withTempDir, writeFiles } from "./helpers.ts";

// Fixture sources split trigger words across strings so `bip scan` on this repo does not report
// this test file itself as a boundary candidate.

type FixtureFile = {
  path: string;
  content: string;
};

test("reports discovery candidates without scoring them", () =>
  scanFixture(
    [
      packageFile(),
      {
        path: "src/navigation.ts",
        content: source(["export const ", "nav", 'Links = [{ href: "/", label: "Home" }];\n']),
      },
      {
        path: "src/app/api/status/route.ts",
        content: `export async function GET() {\n  return Response.json({ ok: true });\n}\n`,
      },
      {
        path: "src/auth.ts",
        content: source([
          "export async function readUser() {\n  return ",
          "current",
          "User();\n}\n",
        ]),
      },
      {
        path: "src/schema.ts",
        content: source(["const ", "schema", " = ", "z", ".object({ slug: z.string() });\n"]),
      },
      {
        path: "src/projects.ts",
        content: source(["export const ", "project", 'Catalog = [{ slug: "bip" }];\n']),
      },
    ],
    (output) => {
      expect(output).toContain("Discovered Boundaries 5 suggestions");
      expect(output).toContain("Bip Verification Score: unavailable");
      expect(output).toContain("Rule: bip/api-contracts");
      expect(output).toContain("Rule: bip/auth-and-permissions");
      expect(output).toContain("Rule: bip/content-catalogs");
      expect(output).toContain("Rule: bip/navigation-and-links");
      expect(output).toContain("Rule: bip/runtime-schemas");
      expect(output).toContain("src/projects.ts:1");
      expect(output).toContain("src/navigation.ts:1");
      expect(output).toContain("src/app/api/status/route.ts:1");
      expect(output).toContain("Bip Verification Score:");
    },
  ));

test("detects route maps, JSX links, and imperative navigation", () =>
  scanFixture(
    [
      packageFile(),
      {
        path: "src/routes.ts",
        content: source(["export const ", "route", 'Map = { home: "/", writing: "/writing" };\n']),
      },
      {
        path: "src/app/page.tsx",
        content: `import Link from "next/link";\n\nexport default function Page() {\n  return <Link href="/writing">Writing</Link>;\n}\n`,
      },
      {
        path: "src/app/actions.ts",
        content: source([
          "import { ",
          "redirect",
          ' } from "next/navigation";\n\nexport function goToDashboard() {\n  ',
          "redirect",
          '("/dashboard");\n}\n',
        ]),
      },
    ],
    (output) => {
      expect(output).toContain("Discovered Boundaries 1 suggestion");
      expect(output).toContain("Navigation and links candidates ×3");
      expect(output).toContain("3 files without generated Bip code.");
      expect(output).toContain("src/routes.ts:1");
      expect(output).toContain("src/app/page.tsx:4");
      expect(output).toContain("src/app/actions.ts:4");
    },
  ));

test("ignores known false-positive paths and allowed public env reads", () =>
  scanFixture(
    [
      packageFile(),
      {
        path: "src/components/ui/button.tsx",
        content: source(["export const ", "nav", 'Links = [{ href: "/", label: "Home" }];\n']),
      },
      {
        path: "generated/api.ts",
        content: source([
          "export async function loadGenerated() {\n  return ",
          "fetch",
          '("/api/generated");\n}\n',
        ]),
      },
      {
        path: "src/generated/auth.ts",
        content: source([
          "export async function generatedAuth() {\n  return ",
          "current",
          "User();\n}\n",
        ]),
      },
      {
        path: "src/env.ts",
        content: `export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;\n`,
      },
      {
        path: "src/charts/table.ts",
        content: source(["export const analytics", 'Projects = [{ name: "Revenue" }];\n']),
      },
      {
        path: "src/config/load.ts",
        content: `const candidate = "bip.config.ts";\nconst pathCandidates = ["lean"];\nconst catalogPattern = /catalog/;\n`,
      },
      {
        path: "src/lean/emit.ts",
        content: `function emitCounterNatReducer() {\n  return "generated reducer proof";\n}\n`,
      },
      {
        path: "src/tscore/emit-lean.ts",
        content: "const reducer = `| state, _ => state`;",
      },
      {
        path: "src/scan/discover-boundaries.ts",
        content: source([
          "const boundaryRules = [/(",
          "current",
          "User|",
          "fetch",
          "\\(|=>\\s*state)/];\n",
        ]),
      },
      {
        path: "src/components/ui/link.tsx",
        content: `<a href="/">Home</a>;\n`,
      },
    ],
    (output) => {
      expect(output).toContain("No verification issues found.");
      expect(output).toContain("Bip Verification Score: unavailable");
      expect(output).not.toContain("Rule: bip/navigation-and-links");
      expect(output).not.toContain("Rule: bip/content-catalogs");
      expect(output).not.toContain("Rule: bip/auth-and-permissions");
      expect(output).not.toContain("Rule: bip/external-io");
    },
  ));

test("reports generated artifacts that differ from a fresh generation", () =>
  scanFixture(
    [
      packageFile(),
      {
        path: "bip.config.ts",
        content: `export default { modules: [{ name: "site", source: "bip/site.tscore.ts", outDir: "src/generated/bip/site" }] };\n`,
      },
      {
        path: "bip/site.tscore.ts",
        content: `export default { kind: "TSCoreModule", name: "SiteCore", records: [], unions: [], constants: [], functions: [], stateMachines: [] };\n`,
      },
      {
        path: "src/generated/bip/site/proof-manifest.json",
        content: JSON.stringify({
          checker: "lean4",
          source: "bip/site.tscore.ts",
          leanCheck: { status: "checked", detail: "" },
          verifiedExports: [],
        }),
      },
    ],
    (output) => {
      expect(output).toContain("Rule: bip/stale-generated-artifacts");
      expect(output).toContain("src/generated/bip/site/runtime/SiteCore.ts");
      expect(output).toContain("src/generated/bip/site/proof-manifest.json");
    },
  ));

// Scans a project made of `files` and hands the printed report to `check`.
function scanFixture(files: FixtureFile[], check: (output: string) => void): Promise<void> {
  return withTempDir(async (root) => {
    writeFiles(root, Object.fromEntries(files.map((file) => [file.path, file.content])));
    const { output } = await captureOutput(() => scanProject(root));
    check(output);
  });
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
