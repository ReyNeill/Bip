import { defineBipConfig } from "./src/index.ts";

export default defineBipConfig({
  modules: [
    {
      name: "Scan scoring",
      source: "bip/scan-scoring.tscore.ts",
      outDir: "src/generated/bip",
      category: "Bip Self Proofs",
      weight: 20,
    },
  ],
  checks: [
    {
      name: "Typecheck",
      command: ["bun", "run", "typecheck"],
      category: "Project Checks",
      weight: 20,
    },
    {
      name: "Lint",
      command: ["bun", "run", "lint"],
      category: "Project Checks",
      weight: 10,
    },
    {
      name: "Tests",
      command: ["bun", "test"],
      category: "Project Checks",
      weight: 20,
    },
  ],
});
