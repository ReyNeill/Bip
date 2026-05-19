import path from "node:path";
import { resolveReyneillSiteRoot } from "../src/adapters/reyneill.ts";
import { verifyCore } from "../src/commands/verify-core.ts";

const siteRoot = resolveReyneillSiteRoot();

const targets = [
  {
    name: "site",
    sourcePath: "examples/personal-site.tscore.ts",
    outDir: path.join(siteRoot, "src", "generated", "bip", "site"),
  },
  {
    name: "writing",
    sourcePath: "examples/reyneill-writing.tscore.ts",
    outDir: path.join(siteRoot, "src", "generated", "bip", "writing"),
  },
  {
    name: "projects",
    sourcePath: "examples/reyneill-projects.tscore.ts",
    outDir: path.join(siteRoot, "src", "generated", "bip", "projects"),
  },
];

const requestedTarget = Bun.argv[2];
const selectedTargets = requestedTarget ? targets.filter((target) => target.name === requestedTarget) : targets;

if (requestedTarget && selectedTargets.length === 0) {
  throw new Error(`Unknown Reyneill verify target '${requestedTarget}'. Expected site, writing, or projects.`);
}

for (const target of selectedTargets) {
  await verifyCore(target);

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}
