// One Lean theorem and, in words, the property it proves.
export type ProvedProperty = {
  statement: string;
  theorem: string;
};

// An export that carries at least one proved property. Generated code without properties is left out.
export type VerifiedExport = {
  exportName: string;
  model: "TSCoreConstant" | "TSCoreFunction" | "TSCoreStateMachine";
  properties: ProvedProperty[];
};

// The `proof-manifest.json` that `bip verify` writes next to each module's generated code.
export type ProofManifest = {
  checker: "lean4";
  toolchain: string;
  source: string;
  proofFile: string;
  leanCheck: {
    status: "checked" | "skipped" | "failed";
    detail: string;
  };
  verifiedExports: VerifiedExport[];
};
