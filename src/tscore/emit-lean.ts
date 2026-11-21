import type { ProvedProperty, VerifiedExport } from "../manifest.ts";
import { guardName, reachableFrom, runName } from "./state-machine.ts";
import type {
  TSCoreConstant,
  TSCoreExpr,
  TSCoreFunction,
  TSCoreFunctionContract,
  TSCoreModule,
  TSCoreRecord,
  TSCoreStateMachine,
  TSCoreTaggedUnion,
  TSCoreType,
} from "./types.ts";

export type TSCoreLeanArtifact = {
  relativePath: string;
  content: string;
  // Exports with at least one theorem, each listing what its theorems prove.
  exports: VerifiedExport[];
};

type LeanEmitContext = {
  records: Map<string, TSCoreRecord>;
  unions: Map<string, TSCoreTaggedUnion>;
};

// A theorem to emit: its name, the property in words, and the Lean declaration.
type Theorem = ProvedProperty & { lean: string };

const NAMESPACE = "Bip.Generated.TSCore";

export function emitTSCoreLean(module: TSCoreModule): TSCoreLeanArtifact {
  const context: LeanEmitContext = {
    records: new Map(module.records.map((record) => [record.name, record])),
    unions: new Map(module.unions.map((union) => [union.name, union])),
  };
  const sections: string[] = [];
  const exports: VerifiedExport[] = [];

  // Adds an export's definitions and theorems, and records the export when it proves anything.
  const add = (exportName: string, model: VerifiedExport["model"], definitions: string[], theorems: Theorem[]) => {
    sections.push(...definitions, ...theorems.map((theorem) => theorem.lean));
    if (theorems.length > 0) {
      exports.push({ exportName, model, properties: theorems.map(({ statement, theorem }) => ({ statement, theorem })) });
    }
  };

  for (const constant of module.constants) {
    add(constant.name, "TSCoreConstant", [`def ${constant.name} : ${emitType(constant.type)} :=\n  ${emitExpr(constant.value, context)}\n`], constantTheorems(constant));
  }

  for (const fn of module.functions) {
    const params = fn.parameters.map((parameter) => `(${parameter.name} : ${emitType(parameter.type)})`).join(" ");
    add(fn.name, "TSCoreFunction", [`def ${fn.name} ${params} : ${emitType(fn.returns)} :=\n  ${emitExpr(fn.body, context)}\n`], functionTheorems(fn, context));
  }

  for (const machine of module.stateMachines) {
    add(machine.name, "TSCoreStateMachine", stateMachineDefinitions(machine), stateMachineTheorems(machine));
  }

  const content = [
    "import Init",
    "",
    `namespace ${NAMESPACE}`,
    "",
    `/-! Generated from TSCore module '${module.name}'. -/`,
    "",
    ...module.unions.map(emitUnion),
    ...module.records.map(emitRecord),
    ...sections,
    `end ${NAMESPACE}`,
    "",
  ].join("\n");

  return { relativePath: `proofs/${sanitize(module.name)}.lean`, content, exports };
}

function theorem(name: string, statement: string, signature: string, proof: string): Theorem {
  return { statement, theorem: `${NAMESPACE}.${name}`, lean: `theorem ${name}${signature} := by\n${proof}\n` };
}

function constantTheorems(constant: TSCoreConstant): Theorem[] {
  const name = constant.name;

  return (constant.contracts ?? []).map((contract) => {
    switch (contract.kind) {
      case "nonEmptyArray":
        return theorem(`${name}_nonempty`, `${name} is non-empty`, ` :\n    ${name} != []`, "  decide");
      case "allItemsFieldNonEmpty":
        return theorem(
          `${name}_all_${contract.field}_nonempty`,
          `every ${name} item has a non-empty ${contract.field}`,
          ` :\n    ${name}.all (fun item => item.${contract.field} != "") = true`,
          "  decide",
        );
      case "allItemsFieldUnique":
        return theorem(
          `${name}_all_${contract.field}_unique`,
          `${contract.field} is unique across ${name}`,
          ` :\n    (${name}.map (fun item => item.${contract.field})).Nodup`,
          "  decide",
        );
      case "allItemsFieldStartsWith":
        return theorem(
          `${name}_all_${contract.field}_starts_with`,
          `every ${name} ${contract.field} starts with ${JSON.stringify(contract.prefix)}`,
          ` :\n    ${name}.all (fun item => ${JSON.stringify(contract.prefix)}.toList.isPrefixOf item.${contract.field}.toList) = true`,
          "  decide",
        );
      case "allItemsFieldStartsWithOneOf": {
        const prefixes = contract.prefixes.map((prefix) => JSON.stringify(prefix)).join(", ");
        return theorem(
          `${name}_all_${contract.field}_starts_with_one_of`,
          `every ${name} ${contract.field} starts with one of ${prefixes}`,
          ` :\n    ${name}.all (fun item => [${prefixes}].any (fun p => p.toList.isPrefixOf item.${contract.field}.toList)) = true`,
          "  decide",
        );
      }
      case "allItemsFieldEmptyOrStartsWith":
        return theorem(
          `${name}_all_${contract.field}_empty_or_starts_with`,
          `every ${name} ${contract.field} is empty or starts with ${JSON.stringify(contract.prefix)}`,
          ` :\n    ${name}.all (fun item => item.${contract.field} = "" || ${JSON.stringify(contract.prefix)}.toList.isPrefixOf item.${contract.field}.toList) = true`,
          "  decide",
        );
      case "allItemsFieldInConstant":
        return theorem(
          `${name}_all_${contract.field}_in_${contract.constant}`,
          `every ${name} ${contract.field} appears as a ${contract.constant} ${contract.constantField}`,
          ` :\n    ${name}.all (fun item => ${contract.constant}.any (fun candidate => candidate.${contract.constantField} == item.${contract.field})) = true`,
          "  decide",
        );
      case "fieldEquals":
        return theorem(
          `${name}_${contract.field}_eq`,
          `${name}.${contract.field} is ${JSON.stringify(contract.value)}`,
          ` :\n    ${name}.${contract.field} = ${JSON.stringify(contract.value)}`,
          "  rfl",
        );
    }
  });
}

function functionTheorems(fn: TSCoreFunction, context: LeanEmitContext): Theorem[] {
  const params = fn.parameters.map((parameter) => `(${parameter.name} : ${emitType(parameter.type)})`).join(" ");
  const call = `${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")}`;
  const signature = params ? ` ${params}` : "";

  return (fn.contracts ?? []).flatMap((contract) => {
    switch (contract.kind) {
      case "returnsStartsWith":
        return [
          theorem(
            `${fn.name}_returns_prefix`,
            `${fn.name} returns a string starting with ${JSON.stringify(contract.prefix)} for every input`,
            `${signature} :\n    ${JSON.stringify(contract.prefix)}.toList.isPrefixOf (${call}).toList = true`,
            `  unfold ${fn.name}\n  simp`,
          ),
        ];
      case "returnsEndsWith":
        return [
          theorem(
            `${fn.name}_returns_suffix`,
            `${fn.name} returns a string ending with ${JSON.stringify(contract.suffix)} for every input`,
            `${signature} :\n    ∃ p : String, ${call} = p ++ ${JSON.stringify(contract.suffix)}`,
            `  unfold ${fn.name}\n  exact ⟨${emitSuffixPrefixWitness(fn.body, contract.suffix, context)}, rfl⟩`,
          ),
        ];
      case "nonEmptyFieldsPredicate":
        return nonEmptyFieldsPredicateTheorems(fn, contract, context);
    }
  });
}

function stateMachineDefinitions(machine: TSCoreStateMachine): string[] {
  const { name, stateName: S, actionName: A } = machine;
  const clauses = machine.transitions.map((transition) => `  | .${transition.from}, .${transition.action} => .${transition.to}`);

  return [
    `inductive ${S} where\n${machine.states.map((state) => `  | ${state}`).join("\n")}\nderiving Repr, DecidableEq\n`,
    `inductive ${A} where\n${machine.actions.map((action) => `  | ${action}`).join("\n")}\nderiving Repr, DecidableEq\n`,
    `def ${name} : ${S} -> ${A} -> ${S}\n${clauses.join("\n")}\n  | state, _ => state\n`,
    `def ${guardName(machine)} : ${S} -> ${A} -> Bool\n${clauses.map((clause) => clause.replace(/=> .+$/, "=> true")).join("\n")}\n  | _, _ => false\n`,
    `def ${runName(machine)} : ${S} -> List ${A} -> ${S}\n  | state, [] => state\n  | state, action :: rest => ${runName(machine)} (${name} state action) rest\n`,
  ];
}

// Whole-machine properties. The transition table itself is the definition, so restating its rows
// as theorems would add nothing; these statements quantify over states, actions, or action lists.
function stateMachineTheorems(machine: TSCoreStateMachine): Theorem[] {
  const { name, stateName: S, actionName: A } = machine;
  const guard = guardName(machine);
  const run = runName(machine);
  const guardAgreement = theorem(
    `${name}_blocked_keeps_state`,
    `actions that ${guard} blocks leave the ${name} state unchanged`,
    ` (state : ${S}) (action : ${A}) :\n    ${guard} state action = false -> ${name} state action = state`,
    "  cases state <;> cases action <;> decide",
  );
  const terminal = (machine.terminalStates ?? []).map((state) =>
    theorem(
      `${name}_${state}_terminal`,
      `${state} is terminal: every action keeps it`,
      ` (action : ${A}) :\n    ${name} .${state} action = .${state}`,
      "  cases action <;> rfl",
    ),
  );
  const initial = machine.initialState;
  const paths = initial ? reachableFrom(machine, initial) : new Map<string, string[]>();
  const reachable = initial
    ? machine.states
        .filter((state) => state !== initial)
        .map((state) => {
          const witness = (paths.get(state) ?? []).map((action) => `.${action}`).join(", ");
          return theorem(
            `${name}_${state}_reachable`,
            `${state} is reachable from ${initial}`,
            ` :\n    ∃ actions : List ${A}, ${run} .${initial} actions = .${state}`,
            `  exact ⟨[${witness}], by decide⟩`,
          );
        })
    : [];
  const never = (machine.never ?? []).map(({ from, to }) => neverTheorem(machine, from, to));

  return [guardAgreement, ...terminal, ...reachable, ...never];
}

// Proves that `to` is unreachable from `from`: the states reachable from `from` are closed under
// every action and exclude `to`, so induction over the action list keeps the run inside them.
function neverTheorem(machine: TSCoreStateMachine, from: string, to: string): Theorem {
  const { name, stateName: S, actionName: A } = machine;
  const run = runName(machine);
  const closure = [...reachableFrom(machine, from).keys()];
  const inside = `(fun state : ${S} => match state with\n${closure.map((state) => `      | .${state} => true`).join("\n")}\n      | _ => false)`;
  const proof = [
    `  let inside : ${S} -> Bool := ${inside}`,
    `  have closed : ∀ (state : ${S}) (action : ${A}), inside state = true -> inside (${name} state action) = true := by`,
    "    intro state action",
    "    cases state <;> cases action <;> decide",
    `  have stays : ∀ (rest : List ${A}) (state : ${S}), inside state = true -> inside (${run} state rest) = true := by`,
    "    intro rest",
    "    induction rest with",
    "    | nil => intro state h; exact h",
    `    | cons action rest ih => intro state h; exact ih (${name} state action) (closed state action h)`,
    "  intro reached",
    `  have h := stays actions .${from} (by decide)`,
    "  rw [reached] at h",
    "  exact absurd h (by decide)",
  ].join("\n");

  return theorem(
    `${name}_${from}_never_reaches_${to}`,
    `no sequence of actions takes ${name} from ${from} to ${to}`,
    ` (actions : List ${A}) :\n    ${run} .${from} actions ≠ .${to}`,
    proof,
  );
}

function emitRecord(record: TSCoreRecord): string {
  const fields = record.fields.map((field) => `  ${field.name} : ${emitType(field.type)}`).join("\n");
  return `structure ${record.name} where\n${fields}\nderiving Repr, BEq\n`;
}

function emitUnion(union: TSCoreTaggedUnion): string {
  const variants = union.variants.map((variant) => {
    const fields = variant.fields?.map((field) => emitType(field.type)).join(" -> ");
    return fields ? `  | ${variant.name} : ${fields} -> ${union.name}` : `  | ${variant.name}`;
  });
  return `inductive ${union.name} where\n${variants.join("\n")}\nderiving Repr, BEq\n`;
}

function nonEmptyFieldsPredicateTheorems(
  fn: TSCoreFunction,
  contract: Extract<TSCoreFunctionContract, { kind: "nonEmptyFieldsPredicate" }>,
  context: LeanEmitContext,
): Theorem[] {
  const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
  const record = parameter?.type.kind === "named" ? context.records.get(parameter.type.name) : undefined;
  if (!record) {
    return [];
  }

  return contract.fields.map((emptyField) => {
    const params = record.fields
      .filter((field) => field.name !== emptyField)
      .map((field) => ` (${field.name} : ${emitType(field.type)})`)
      .join("");
    const fields = record.fields
      .map((field) => `${field.name} := ${field.name === emptyField ? JSON.stringify("") : field.name}`)
      .join(", ");

    return theorem(
      `${fn.name}_${emptyField}_empty_is_false`,
      `${fn.name} returns false whenever ${contract.parameter}.${emptyField} is empty`,
      `${params} :\n    ${fn.name} { ${fields} } = false`,
      `  unfold ${fn.name}\n  simp`,
    );
  });
}

function emitType(type: TSCoreType): string {
  if (type.kind === "primitive") {
    return type.name;
  }

  if (type.kind === "array") {
    return `List ${emitType(type.item)}`;
  }

  return type.name;
}

function emitExpr(expr: TSCoreExpr, context: LeanEmitContext): string {
  if (expr.kind === "var") {
    return expr.name;
  }

  if (expr.kind === "string") {
    return JSON.stringify(expr.value);
  }

  if (expr.kind === "bool") {
    return expr.value ? "true" : "false";
  }

  if (expr.kind === "nat") {
    return String(expr.value);
  }

  if (expr.kind === "variant") {
    const union = context.unions.get(expr.unionName);
    const variant = union?.variants.find((candidate) => candidate.name === expr.variant);
    const args = variant?.fields?.flatMap((field) => {
      const value = expr.fields?.[field.name];
      return value ? [emitExpr(value, context)] : [];
    }) ?? [];
    return args.length > 0 ? `(${expr.unionName}.${expr.variant} ${args.join(" ")})` : `${expr.unionName}.${expr.variant}`;
  }

  if (expr.kind === "isVariant") {
    const union = context.unions.get(expr.unionName);
    const variants = union?.variants ?? [];
    const clauses = variants.map((variant) => {
      const pattern = emitVariantPattern(expr.unionName, variant);
      const result = variant.name === expr.variant ? "true" : "false";
      return `  | ${pattern} => ${result}`;
    });
    return `(match ${emitExpr(expr.target, context)} with\n${clauses.join("\n")})`;
  }

  if (expr.kind === "stringNonEmpty") {
    return `!(${emitExpr(expr.target, context)} == "")`;
  }

  if (expr.kind === "and") {
    return expr.terms.length > 0 ? `(${expr.terms.map((term) => emitExpr(term, context)).join(" && ")})` : "true";
  }

  if (expr.kind === "field") {
    return `${emitExpr(expr.target, context)}.${expr.field}`;
  }

  if (expr.kind === "array") {
    return `[${expr.items.map((item) => emitExpr(item, context)).join(", ")}]`;
  }

  if (expr.kind === "concat") {
    return `(${expr.parts.map((part) => emitExpr(part, context)).join(" ++ ")})`;
  }

  const fields = Object.entries(expr.fields).map(([field, value]) => `${field} := ${emitExpr(value, context)}`).join(", ");
  return `{ ${fields} }`;
}

function emitVariantPattern(unionName: string, variant: TSCoreTaggedUnion["variants"][number]): string {
  const args = variant.fields?.map(() => "_").join(" ") ?? "";
  return args ? `${unionName}.${variant.name} ${args}` : `${unionName}.${variant.name}`;
}

function emitSuffixPrefixWitness(expr: TSCoreExpr, suffix: string, context: LeanEmitContext): string {
  if (expr.kind === "string" && expr.value === suffix) {
    return JSON.stringify("");
  }

  if (expr.kind === "concat") {
    const parts = [...expr.parts];
    const last = parts.at(-1);
    if (last?.kind === "string" && last.value === suffix) {
      const prefixParts = parts.slice(0, -1);
      return prefixParts.length > 0 ? `(${prefixParts.map((part) => emitExpr(part, context)).join(" ++ ")})` : JSON.stringify("");
    }
  }

  return emitExpr(expr, context);
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}
