import ts from "typescript";
import type { Contract } from "./types.ts";

type ParsedDirectives = {
  requires: string[];
  ensures: string[];
  model: string | null;
};

export function extractContracts(sourcePath: string, sourceText: string): Contract[] {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const contracts: Contract[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) {
      continue;
    }

    if (!isExported(statement)) {
      continue;
    }

    const directives = parseLeadingDirectives(sourceText, statement);
    if (directives.requires.length === 0 && directives.ensures.length === 0 && !directives.model) {
      continue;
    }

    contracts.push({
      sourcePath,
      functionName: statement.name.text,
      parameters: statement.parameters.map((parameter) => ({
        name: parameter.name.getText(sourceFile),
        type: parameter.type?.getText(sourceFile) ?? "unknown",
      })),
      returnType: statement.type?.getText(sourceFile) ?? "unknown",
      requires: directives.requires,
      ensures: directives.ensures,
      model: directives.model,
    });
  }

  return contracts;
}

function isExported(node: ts.FunctionDeclaration): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function parseLeadingDirectives(sourceText: string, node: ts.Node): ParsedDirectives {
  const ranges = ts.getLeadingCommentRanges(sourceText, node.pos) ?? [];
  const directives: ParsedDirectives = {
    requires: [],
    ensures: [],
    model: null,
  };

  for (const range of ranges) {
    const comment = sourceText.slice(range.pos, range.end);

    for (const rawLine of comment.split("\n")) {
      const line = rawLine.replace(/^\s*\/\/\/?@?/, "").replace(/^\s*\*\s?/, "").trim();
      const directive = parseDirective(line);

      if (!directive) {
        continue;
      }

      if (directive.kind === "requires") {
        directives.requires.push(directive.value);
      }

      if (directive.kind === "ensures") {
        directives.ensures.push(directive.value);
      }

      if (directive.kind === "model") {
        directives.model = directive.value;
      }
    }
  }

  return directives;
}

function parseDirective(line: string): { kind: "requires" | "ensures" | "model"; value: string } | null {
  const requires = line.match(/^requires\s+(.+)$/);
  if (requires?.[1]) {
    return { kind: "requires", value: requires[1].trim() };
  }

  const ensures = line.match(/^ensures\s+(.+)$/);
  if (ensures?.[1]) {
    return { kind: "ensures", value: ensures[1].trim() };
  }

  const model = line.match(/^bip:model\s+(.+)$/);
  if (model?.[1]) {
    return { kind: "model", value: model[1].trim() };
  }

  return null;
}
