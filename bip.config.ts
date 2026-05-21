import { defineBipConfig } from "bip";

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
      name: "Scan fixtures",
      command: ["bun", "run", "test:scan"],
      category: "Project Checks",
      weight: 10,
    },
    {
      name: "TSCore validation fixtures",
      command: ["bun", "run", "test:tscore"],
      category: "Project Checks",
      weight: 10,
    },
  ],
});
