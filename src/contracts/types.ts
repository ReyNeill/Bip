export type Contract = {
  sourcePath: string;
  functionName: string;
  parameters: Array<{
    name: string;
    type: string;
  }>;
  returnType: string;
  requires: string[];
  ensures: string[];
  model: string | null;
};

export type VerifiedExport = {
  exportName: string;
  model: string | null;
  proofFile: string | null;
  requires: string[];
  ensures: string[];
  theoremNames: string[];
  status: "generated" | "needs_model" | "checked" | "skipped" | "failed";
};

export type ProofManifest = {
  checker: "lean4";
  generatedAt: string;
  source: string;
  leanCheck: {
    status: "checked" | "skipped" | "failed";
    detail: string;
  };
  verifiedExports: VerifiedExport[];
};
