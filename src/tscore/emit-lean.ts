import type {
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
  theoremNames: string[];
};

type LeanEmitContext = {
  records: Map<string, TSCoreRecord>;
  unions: Map<string, TSCoreTaggedUnion>;
};

export function emitTSCoreLean(module: TSCoreModule): TSCoreLeanArtifact {
  const theoremNames: string[] = [];
  const context: LeanEmitContext = {
    records: new Map(module.records.map((record) => [record.name, record])),
    unions: new Map(module.unions.map((union) => [union.name, union])),
  };
  const sections = [
    "import Init",
    "",
    "namespace Bip.Generated.TSCore",
    "",
    `/-! Generated from TSCore module '${module.name}'. -/`,
    "",
    ...module.unions.map(emitUnion),
    ...module.records.map(emitRecord),
    ...module.constants.flatMap((constant) => emitConstant(constant, theoremNames, context)),
    ...module.functions.flatMap((fn) => emitFunction(fn, theoremNames, context)),
    ...module.stateMachines.flatMap((machine) => emitStateMachine(machine, theoremNames)),
    "end Bip.Generated.TSCore",
    "",
  ];

  return {
    relativePath: `proofs/${sanitize(module.name)}.lean`,
    content: sections.join("\n"),
    theoremNames,
  };
}

function emitConstant(constant: TSCoreModule["constants"][number], theoremNames: string[], context: LeanEmitContext): string[] {
  const definition = `def ${constant.name} : ${emitType(constant.type)} :=\n  ${emitExpr(constant.value, context)}\n`;
  const theorems = (constant.contracts ?? []).map((contract) => {
    if (contract.kind === "nonEmptyArray") {
      const theoremName = `${constant.name}_nonempty`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name} != [] := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldNonEmpty") {
      const theoremName = `${constant.name}_all_${contract.field}_nonempty`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name}.all (fun item => item.${contract.field} != "") = true := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldUnique") {
      const theoremName = `${constant.name}_all_${contract.field}_unique`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    (${constant.name}.map (fun item => item.${contract.field})).Nodup := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldStartsWith") {
      const theoremName = `${constant.name}_all_${contract.field}_starts_with`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name}.all (fun item => ${JSON.stringify(contract.prefix)}.toList.isPrefixOf item.${contract.field}.toList) = true := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldStartsWithOneOf") {
      const theoremName = `${constant.name}_all_${contract.field}_starts_with_one_of`;
      const prefixes = `[${contract.prefixes.map((prefix) => JSON.stringify(prefix)).join(", ")}]`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name}.all (fun item => ${prefixes}.any (fun p => p.toList.isPrefixOf item.${contract.field}.toList)) = true := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldEmptyOrStartsWith") {
      const theoremName = `${constant.name}_all_${contract.field}_empty_or_starts_with`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name}.all (fun item => item.${contract.field} = "" || ${JSON.stringify(contract.prefix)}.toList.isPrefixOf item.${contract.field}.toList) = true := by\n  decide\n`;
    }

    if (contract.kind === "allItemsFieldInConstant") {
      const theoremName = `${constant.name}_all_${contract.field}_in_${contract.constant}`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${constant.name}.all (fun item => ${contract.constant}.any (fun candidate => candidate.${contract.constantField} == item.${contract.field})) = true := by\n  decide\n`;
    }

    const theoremName = `${constant.name}_${contract.field}_eq`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} :\n    ${constant.name}.${contract.field} = ${JSON.stringify(contract.value)} := by\n  rfl\n`;
  });

  return [definition, ...theorems];
}

function emitRecord(record: TSCoreModule["records"][number]): string {
  const fields = record.fields.map((field) => `  ${field.name} : ${emitType(field.type)}`).join("\n");
  return `structure ${record.name} where\n${fields}\nderiving Repr, BEq\n`;
}

function emitUnion(union: TSCoreModule["unions"][number]): string {
  const variants = union.variants.map((variant) => {
    const fields = variant.fields?.map((field) => emitType(field.type)).join(" -> ");
    return fields ? `  | ${variant.name} : ${fields} -> ${union.name}` : `  | ${variant.name}`;
  });
  return `inductive ${union.name} where\n${variants.join("\n")}\nderiving Repr, BEq\n`;
}

function emitFunction(fn: TSCoreFunction, theoremNames: string[], context: LeanEmitContext): string[] {
  const params = fn.parameters.map((parameter) => `(${parameter.name} : ${emitType(parameter.type)})`).join(" ");
  const definition = `def ${fn.name} ${params} : ${emitType(fn.returns)} :=\n  ${emitExpr(fn.body, context)}\n`;
  const theorems = (fn.contracts ?? []).map((contract) => {
    if (contract.kind === "idempotent") {
      const theoremName = `${fn.name}_idempotent`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} ${params} :\n    ${fn.name} (${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")}) = ${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")} := by\n  rfl\n`;
    }

    if (contract.kind === "returnsVariant") {
      const theoremName = `${fn.name}_returns_${contract.variant}`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} ${params} :\n    ${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")} = ${emitExpr(fn.body, context)} := by\n  rfl\n`;
    }

    if (contract.kind === "recordConstructor") {
      return emitRecordConstructorTheorems(fn, theoremNames, context).join("\n");
    }

    if (contract.kind === "returnsStartsWith") {
      const theoremName = `${fn.name}_returns_prefix`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} ${params} :\n    ${JSON.stringify(contract.prefix)}.toList.isPrefixOf (${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")}).toList = true := by\n  unfold ${fn.name}\n  simp\n`;
    }

    if (contract.kind === "returnsEndsWith") {
      const theoremName = `${fn.name}_returns_suffix`;
      const prefix = emitSuffixPrefixWitness(fn.body, contract.suffix, context);
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} ${params} :\n    ∃ p : String, ${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")} = p ++ ${JSON.stringify(contract.suffix)} := by\n  unfold ${fn.name}\n  exact ⟨${prefix}, rfl⟩\n`;
    }

    if (contract.kind === "variantPredicate") {
      return emitVariantPredicateTheorems(fn, contract, theoremNames, context).join("\n");
    }

    if (contract.kind === "nonEmptyFieldsPredicate") {
      return emitNonEmptyFieldsPredicateTheorems(fn, contract, theoremNames, context).join("\n");
    }

    const theoremName = `${fn.name}_returns_${contract.parameter}_${contract.field}`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} ${params} :\n    ${fn.name} ${fn.parameters.map((parameter) => parameter.name).join(" ")} = ${contract.parameter}.${contract.field} := by\n  rfl\n`;
  });

  return [definition, ...theorems];
}

function emitStateMachine(machine: TSCoreStateMachine, theoremNames: string[]): string[] {
  const states = `inductive ${machine.stateName} where\n${machine.states.map((state) => `  | ${state}`).join("\n")}\nderiving Repr, BEq\n`;
  const actions = `inductive ${machine.actionName} where\n${machine.actions.map((action) => `  | ${action}`).join("\n")}\nderiving Repr, BEq\n`;
  const clauses = machine.transitions.map((transition) => {
    return `  | .${transition.from}, .${transition.action} => .${transition.to}`;
  });
  const reducer = `def ${machine.name} : ${machine.stateName} -> ${machine.actionName} -> ${machine.stateName}\n${clauses.join("\n")}\n  | state, _ => state\n`;
  const guard = `def ${stateMachineGuardName(machine)} : ${machine.stateName} -> ${machine.actionName} -> Bool\n${clauses.map((clause) => clause.replace(/=> .+$/, "=> true")).join("\n")}\n  | _, _ => false\n`;
  const transitionTheorems = machine.transitions.map((transition) => {
    const theoremName = `${machine.name}_${transition.from}_${transition.action}_to_${transition.to}`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} :\n    ${machine.name} .${transition.from} .${transition.action} = .${transition.to} := by\n  rfl\n`;
  });
  const selfTransitionTheorems = implicitSelfTransitions(machine).map((transition) => {
    const theoremName = `${machine.name}_${transition.state}_${transition.action}_stays_${transition.state}`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} :\n    ${machine.name} .${transition.state} .${transition.action} = .${transition.state} := by\n  rfl\n`;
  });
  const terminalTheorems = (machine.terminalStates ?? []).map((state) => {
    const theoremName = `${machine.name}_${state}_terminal`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} (action : ${machine.actionName}) :\n    ${machine.name} .${state} action = .${state} := by\n  cases action <;> rfl\n`;
  });
  const guardTheorems = [
    ...machine.transitions.map((transition) => {
      const theoremName = `${stateMachineGuardName(machine)}_${transition.from}_${transition.action}_is_allowed`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${stateMachineGuardName(machine)} .${transition.from} .${transition.action} = true := by\n  rfl\n`;
    }),
    ...implicitSelfTransitions(machine).map((transition) => {
      const theoremName = `${stateMachineGuardName(machine)}_${transition.state}_${transition.action}_is_blocked`;
      theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
      return `theorem ${theoremName} :\n    ${stateMachineGuardName(machine)} .${transition.state} .${transition.action} = false := by\n  rfl\n`;
    }),
  ];

  return [states, actions, reducer, guard, ...transitionTheorems, ...selfTransitionTheorems, ...terminalTheorems, ...guardTheorems];
}

function stateMachineGuardName(machine: TSCoreStateMachine): string {
  return `can${machine.name.slice(0, 1).toUpperCase()}${machine.name.slice(1)}`;
}

function implicitSelfTransitions(machine: TSCoreStateMachine): Array<{ state: string; action: string }> {
  const explicit = new Set(machine.transitions.map((transition) => `${transition.from}:${transition.action}`));
  return machine.states.flatMap((state) => {
    return machine.actions.flatMap((action) => {
      return explicit.has(`${state}:${action}`) ? [] : [{ state, action }];
    });
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

function emitVariantPredicateTheorems(
  fn: TSCoreFunction,
  contract: Extract<TSCoreFunctionContract, { kind: "variantPredicate" }>,
  theoremNames: string[],
  context: LeanEmitContext,
): string[] {
  const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
  const union = parameter?.type.kind === "named" ? context.unions.get(parameter.type.name) : undefined;
  if (!union) {
    return [];
  }

  return union.variants.map((variant) => {
    const theoremName = `${fn.name}_${variant.name}_${variant.name === contract.variant ? "is" : "is_not"}_${contract.variant}`;
    const params = variant.fields?.map((field) => `(${field.name} : ${emitType(field.type)})`).join(" ") ?? "";
    const args = variant.fields?.map((field) => field.name).join(" ") ?? "";
    const appliedVariant = args ? `(${union.name}.${variant.name} ${args})` : `${union.name}.${variant.name}`;
    const result = variant.name === contract.variant ? "true" : "false";
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} ${params} :\n    ${fn.name} ${appliedVariant} = ${result} := by\n  rfl\n`;
  });
}

function emitRecordConstructorTheorems(
  fn: TSCoreFunction,
  theoremNames: string[],
  context: LeanEmitContext,
): string[] {
  const record = fn.returns.kind === "named" ? context.records.get(fn.returns.name) : undefined;
  if (!record) {
    return [];
  }

  const params = fn.parameters.map((parameter) => `(${parameter.name} : ${emitType(parameter.type)})`).join(" ");
  const args = fn.parameters.map((parameter) => parameter.name).join(" ");
  const theorems = record.fields.map((field) => {
    const theoremName = `${fn.name}_${field.name}_eq`;
    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} ${params} :\n    (${fn.name} ${args}).${field.name} = ${field.name} := by\n  rfl\n`;
  });

  const theoremName = `${fn.name}_returns_record`;
  theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
  return [
    `theorem ${theoremName} ${params} :\n    ${fn.name} ${args} = ${emitExpr(fn.body, context)} := by\n  rfl\n`,
    ...theorems,
  ];
}

function emitNonEmptyFieldsPredicateTheorems(
  fn: TSCoreFunction,
  contract: Extract<TSCoreFunctionContract, { kind: "nonEmptyFieldsPredicate" }>,
  theoremNames: string[],
  context: LeanEmitContext,
): string[] {
  const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
  const record = parameter?.type.kind === "named" ? context.records.get(parameter.type.name) : undefined;
  if (!record) {
    return [];
  }

  return contract.fields.map((emptyField) => {
    const theoremName = `${fn.name}_${emptyField}_empty_is_false`;
    const params = record.fields
      .filter((field) => field.name !== emptyField)
      .map((field) => `(${field.name} : ${emitType(field.type)})`)
      .join(" ");
    const fields = record.fields
      .map((field) => {
        const value = field.name === emptyField ? JSON.stringify("") : field.name;
        return `${field.name} := ${value}`;
      })
      .join(", ");

    theoremNames.push(`Bip.Generated.TSCore.${theoremName}`);
    return `theorem ${theoremName} ${params} :\n    ${fn.name} { ${fields} } = false := by\n  unfold ${fn.name}\n  simp\n`;
  });
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
