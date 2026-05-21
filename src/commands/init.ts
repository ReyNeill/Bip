import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeTextFile } from "../utils/fs.ts";

const AGENTS_NOTE = `## Bip
Use \`bunx bip verify\` to check proofs and \`bunx bip scan\` to read the score. Do not raise Bip coverage unless asked.
`;

export async function initProject(rootPath = process.cwd()): Promise<void> {
  const root = path.resolve(rootPath);
  const bipDir = path.join(root, "bip");
  const configPath = path.join(root, "bip.config.ts");
  const modulePath = path.join(bipDir, "example.tscore.ts");
  const agentsPath = path.join(root, "AGENTS.md");

  mkdirSync(bipDir, { recursive: true });

  await writeIfMissing(root, configPath, `import { defineBipConfig } from "bip";

export default defineBipConfig({
  modules: [
    {
      name: "example",
      source: "bip/example.tscore.ts",
      outDir: "src/generated/bip/example",
      category: "Example Proofs",
      weight: 10,
    },
  ],
});
`);

  await writeIfMissing(root, modulePath, `import { defineModule } from "bip";

const StringType = { kind: "primitive", name: "String" } as const;

export default defineModule({
  name: "ExampleCore",
  records: [
    {
      kind: "record",
      name: "PageRoute",
      fields: [
        { name: "path", type: StringType },
        { name: "label", type: StringType },
      ],
    },
  ],
  unions: [],
  constants: [
    {
      kind: "constant",
      name: "siteRoutes",
      type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "PageRoute",
            fields: {
              path: { kind: "string", value: "/" },
              label: { kind: "string", value: "Home" },
            },
          },
        ],
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
      ],
    },
  ],
  functions: [],
  stateMachines: [],
});
`);

  await appendAgentsNote(root, agentsPath);

  console.log("Bip initialized.");
  console.log("Next: bunx bip verify");
  console.log("Then: bunx bip scan");
}

async function writeIfMissing(root: string, filePath: string, content: string): Promise<void> {
  if (existsSync(filePath)) {
    console.log(`Skipped existing ${path.relative(root, filePath)}`);
    return;
  }

  await writeTextFile(filePath, content);
  console.log(`Created ${path.relative(root, filePath)}`);
}

async function appendAgentsNote(root: string, filePath: string): Promise<void> {
  const hadAgentsFile = existsSync(filePath);
  const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";

  if (current.includes("bunx bip verify") || current.includes("## Bip")) {
    console.log(`Skipped existing ${path.relative(root, filePath)} Bip note`);
    return;
  }

  const prefix = current.trim().length > 0 ? `${current.trimEnd()}\n\n` : "";
  await writeTextFile(filePath, `${prefix}${AGENTS_NOTE}`);
  console.log(`${hadAgentsFile ? "Updated" : "Created"} ${path.relative(root, filePath)}`);
}
