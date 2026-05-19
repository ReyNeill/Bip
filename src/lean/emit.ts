import path from "node:path";
import type { Contract, VerifiedExport } from "../contracts/types.ts";

export type LeanArtifact = {
  relativePath: string;
  content: string;
  verifiedExport: VerifiedExport;
};

export function emitLeanArtifacts(contract: Contract): LeanArtifact {
  if (contract.model === "CounterNatReducer") {
    return emitCounterNatReducer(contract);
  }

  return {
    relativePath: proofPathFor(contract),
    content: emitUnsupportedModel(contract),
    verifiedExport: {
      exportName: contract.functionName,
      model: contract.model,
      proofFile: null,
      requires: contract.requires,
      ensures: contract.ensures,
      theoremNames: [],
      status: "needs_model",
    },
  };
}

function emitCounterNatReducer(contract: Contract): LeanArtifact {
  const moduleName = sanitizeLeanIdentifier(contract.functionName);
  const theoremName = `${moduleName}_preserves_nonnegative`;
  const relativePath = proofPathFor(contract);

  return {
    relativePath,
    content: `import Init

namespace Bip.Generated

/-!
Generated from ${contract.sourcePath}.

This MVP intentionally models counter state as Nat in Lean. The TypeScript runtime
still uses JavaScript numbers; runtime Nat validation is a later boundary check.
-/

structure CounterState where
  count : Nat
deriving Repr, BEq

def ${moduleName} (state : CounterState) : CounterState :=
  if state.count == 0 then
    { count := 0 }
  else
    { count := state.count - 1 }

theorem ${theoremName} (state : CounterState) :
    (${moduleName} state).count >= 0 := by
  exact Nat.zero_le _

end Bip.Generated
`,
    verifiedExport: {
      exportName: contract.functionName,
      model: contract.model,
      proofFile: relativePath,
      requires: contract.requires,
      ensures: contract.ensures,
      theoremNames: [`Bip.Generated.${theoremName}`],
      status: "generated",
    },
  };
}

function emitUnsupportedModel(contract: Contract): string {
  return `import Init

namespace Bip.Generated

/-!
No Lean model emitter exists for ${contract.functionName}.

Requires:
${contract.requires.map((requirement) => `- ${requirement}`).join("\n") || "- none"}

Ensures:
${contract.ensures.map((ensurement) => `- ${ensurement}`).join("\n") || "- none"}
-/

end Bip.Generated
`;
}

function proofPathFor(contract: Contract): string {
  return path.join("proofs", `${sanitizeFileName(contract.functionName)}.lean`);
}

function sanitizeLeanIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}
