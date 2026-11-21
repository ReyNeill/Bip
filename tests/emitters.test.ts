import { afterAll, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import selfModule from "../bip/scan-scoring.tscore.ts";
import siteModule from "../examples/basic-site.tscore.ts";
import { checkLean } from "../src/lean/check.ts";
import { defineModule } from "../src/tscore/define.ts";
import { emitTSCoreLean } from "../src/tscore/emit-lean.ts";
import { emitTSCoreTypeScript } from "../src/tscore/emit-ts.ts";
import { evaluate, isRecord, type TSCoreValue } from "../src/tscore/evaluate.ts";
import { guardName, step } from "../src/tscore/state-machine.ts";
import type { TSCoreModule, TSCoreType } from "../src/tscore/types.ts";
import { validateModule } from "../src/tscore/validate.ts";

// Differential test: Lean proves facts about the generated Lean definitions, while apps run the
// generated TypeScript. Both emitters are checked against the TSCore evaluator on sample inputs, so
// a divergence between the two outputs fails here. Needs Lean.

const StringType = { kind: "primitive", name: "String" } as const;
const PostType = { kind: "named", name: "Post" } as const;
const ResultType = { kind: "named", name: "Result" } as const;
const post = { kind: "var", name: "post" } as const;

// Exercises every expression kind.
const expressionsModule = defineModule({
  name: "EmitterAgreement",
  records: [
    {
      kind: "record",
      name: "Post",
      fields: [
        { name: "slug", type: StringType },
        { name: "title", type: StringType },
        { name: "draft", type: { kind: "primitive", name: "Bool" } },
        { name: "order", type: { kind: "primitive", name: "Nat" } },
      ],
    },
  ],
  unions: [
    {
      kind: "taggedUnion",
      name: "Result",
      tag: "status",
      variants: [{ name: "ok", fields: [{ name: "path", type: StringType }] }, { name: "missing" }],
    },
  ],
  constants: [
    {
      kind: "constant",
      name: "posts",
      type: { kind: "array", item: PostType },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "Post",
            fields: {
              slug: { kind: "string", value: "bip" },
              title: {
                kind: "concat",
                parts: [
                  { kind: "string", value: "Bip " },
                  { kind: "string", value: "notes" },
                ],
              },
              draft: { kind: "bool", value: false },
              order: { kind: "nat", value: 2 },
            },
          },
        ],
      },
    },
  ],
  functions: [
    {
      kind: "function",
      name: "postHref",
      parameters: [{ name: "post", type: PostType }],
      returns: StringType,
      body: {
        kind: "concat",
        parts: [
          { kind: "string", value: "/writing/" },
          { kind: "field", target: post, field: "slug" },
          { kind: "string", value: "/" },
        ],
      },
    },
    {
      kind: "function",
      name: "isPublishable",
      parameters: [{ name: "post", type: PostType }],
      returns: { kind: "primitive", name: "Bool" },
      body: {
        kind: "and",
        terms: [
          { kind: "stringNonEmpty", target: { kind: "field", target: post, field: "slug" } },
          { kind: "stringNonEmpty", target: { kind: "field", target: post, field: "title" } },
        ],
      },
    },
    {
      kind: "function",
      name: "okResult",
      parameters: [{ name: "path", type: StringType }],
      returns: ResultType,
      body: {
        kind: "variant",
        unionName: "Result",
        tag: "status",
        variant: "ok",
        fields: { path: { kind: "var", name: "path" } },
      },
    },
    {
      kind: "function",
      name: "isOk",
      parameters: [{ name: "result", type: ResultType }],
      returns: { kind: "primitive", name: "Bool" },
      body: {
        kind: "isVariant",
        target: { kind: "var", name: "result" },
        unionName: "Result",
        tag: "status",
        variant: "ok",
      },
    },
    {
      kind: "function",
      name: "postOrder",
      parameters: [{ name: "post", type: PostType }],
      returns: { kind: "primitive", name: "Nat" },
      body: { kind: "field", target: post, field: "order" },
    },
  ],
  stateMachines: [],
});

const root = mkdtempSync(path.join(tmpdir(), "bip-emitters-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

for (const module of [expressionsModule, siteModule, selfModule]) {
  test(
    `${module.name}: generated TypeScript and Lean agree with the evaluator`,
    () => checkModule(module),
    120_000,
  );
}

async function checkModule(module: TSCoreModule): Promise<void> {
  const errors = validateModule(module);
  if (errors.length > 0) {
    throw new Error(`${module.name} is invalid:\n${errors.join("\n")}`);
  }

  const runtimePath = path.join(root, `${module.name}.ts`);
  writeFileSync(runtimePath, emitTSCoreTypeScript(module), "utf8");
  const runtime: Record<string, unknown> = await import(runtimePath);
  const leanExamples: string[] = [];

  for (const constant of module.constants) {
    expectEqual(
      runtime[constant.name],
      evaluate(constant.value),
      `${module.name}.${constant.name}`,
    );
  }

  for (const fn of module.functions) {
    const implementation = runtime[fn.name];
    if (!isCallable(implementation)) {
      throw new Error(`${module.name}.${fn.name} is not a generated function.`);
    }

    for (const args of combinations(
      fn.parameters.map((parameter) => samples(parameter.type, module)),
    )) {
      const expected = evaluate(
        fn.body,
        new Map(fn.parameters.map((parameter, index) => [parameter.name, args[index] ?? ""])),
      );
      const label = `${module.name}.${fn.name}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
      expectEqual(implementation(...args), expected, label);

      if (fn.returns.kind === "primitive") {
        const leanArgs = args
          .map((arg, index) => leanValue(arg, fn.parameters[index]?.type ?? StringType, module))
          .join(" ");
        leanExamples.push(
          `example : ${fn.name} ${leanArgs} = ${leanValue(expected, fn.returns, module)} := by decide`,
        );
      }
    }
  }

  for (const machine of module.stateMachines) {
    const reducer = runtime[machine.name];
    const guard = runtime[guardName(machine)];
    if (!isCallable(reducer) || !isCallable(guard)) {
      throw new Error(`${module.name}.${machine.name} is missing its reducer or guard.`);
    }

    for (const state of machine.states) {
      for (const action of machine.actions) {
        const declared = machine.transitions.some(
          (transition) => transition.from === state && transition.action === action,
        );
        expectEqual(
          reducer(state, action),
          step(machine, state, action),
          `${machine.name}(${state}, ${action})`,
        );
        expectEqual(guard(state, action), declared, `${guardName(machine)}(${state}, ${action})`);
        leanExamples.push(
          `example : ${machine.name} .${state} .${action} = .${step(machine, state, action)} := by decide`,
        );
        leanExamples.push(
          `example : ${guardName(machine)} .${state} .${action} = ${declared} := by decide`,
        );
      }
    }
  }

  const lean = emitTSCoreLean(module).content.replace(
    /end Bip\.Generated\.TSCore\n$/,
    `${leanExamples.join("\n")}\n\nend Bip.Generated.TSCore\n`,
  );
  const leanPath = path.join(root, `${module.name}.lean`);
  writeFileSync(leanPath, lean, "utf8");
  const result = await checkLean([leanPath]);
  if (result.status !== "checked") {
    throw new Error(
      `Generated Lean for ${module.name} disagrees with the evaluator:\n${result.detail}`,
    );
  }
}

// Sample values for a parameter type, shaped like the generated TypeScript.
function samples(type: TSCoreType, module: TSCoreModule): TSCoreValue[] {
  if (type.kind === "primitive") {
    return type.name === "String"
      ? ["", "a", "post/1"]
      : type.name === "Bool"
        ? [true, false]
        : [0, 3];
  }

  if (type.kind === "array") {
    return [[], samples(type.item, module).slice(0, 2)];
  }

  const record = module.records.find((candidate) => candidate.name === type.name);
  if (record) {
    const fieldSamples = record.fields.map((field) => samples(field.type, module));
    // Rotate through each field's samples so records mix empty and non-empty fields.
    return [0, 1, 2].map((offset) =>
      Object.fromEntries(
        record.fields.map((field, index) => {
          const options = fieldSamples[index] ?? [];
          return [field.name, options[(offset + index) % options.length] ?? ""];
        }),
      ),
    );
  }

  const union = module.unions.find((candidate) => candidate.name === type.name);
  return (union?.variants ?? []).map((variant) => ({
    [union?.tag ?? "kind"]: variant.name,
    ...Object.fromEntries(
      (variant.fields ?? []).map((field) => [field.name, samples(field.type, module)[1] ?? ""]),
    ),
  }));
}

// A sample value as a Lean term of the given type.
function leanValue(value: TSCoreValue, type: TSCoreType, module: TSCoreModule): string {
  if (type.kind === "primitive") {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }

  if (type.kind === "array" || !isRecord(value)) {
    throw new Error(`No Lean rendering for ${JSON.stringify(value)}.`);
  }

  const record = module.records.find((candidate) => candidate.name === type.name);
  if (record) {
    const fields = record.fields.map(
      (field) => `${field.name} := ${leanValue(fieldValue(value, field.name), field.type, module)}`,
    );
    return `({ ${fields.join(", ")} } : ${record.name})`;
  }

  const union = module.unions.find((candidate) => candidate.name === type.name);
  const variant = union?.variants.find(
    (candidate) => candidate.name === fieldValue(value, union.tag),
  );
  if (!union || !variant) {
    throw new Error(`Unknown union value ${JSON.stringify(value)}.`);
  }

  const args = (variant.fields ?? []).map((field) =>
    leanValue(fieldValue(value, field.name), field.type, module),
  );
  return args.length > 0
    ? `(${union.name}.${variant.name} ${args.join(" ")})`
    : `${union.name}.${variant.name}`;
}

function fieldValue(value: { readonly [field: string]: TSCoreValue }, field: string): TSCoreValue {
  const result = value[field];
  if (result === undefined) {
    throw new Error(`Missing field '${field}'.`);
  }
  return result;
}

function combinations(options: TSCoreValue[][]): TSCoreValue[][] {
  return options.reduce<TSCoreValue[][]>(
    (rows, values) => rows.flatMap((row) => values.map((value) => [...row, value])),
    [[]],
  );
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === "function";
}

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Bun.deepEquals(actual, expected)) {
    throw new Error(
      `${label}: generated TypeScript returned ${JSON.stringify(actual)}, evaluator returned ${JSON.stringify(expected)}.`,
    );
  }
}
