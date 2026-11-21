import { constantContractHolds, evaluate, type TSCoreValue } from "./evaluate.ts";
import { guardName, reachableFrom, runName } from "./state-machine.ts";
import type {
  TSCoreConstant,
  TSCoreConstantContract,
  TSCoreExpr,
  TSCoreFunction,
  TSCoreModule,
  TSCoreRecord,
  TSCoreStateMachine,
  TSCoreTaggedUnion,
  TSCoreType,
} from "./types.ts";

type TypeContext = {
  records: Map<string, TSCoreRecord>;
  unions: Map<string, TSCoreTaggedUnion>;
  constants: Map<string, TSCoreConstant>;
};

type ExprContext = TypeContext & {
  variables: Map<string, TSCoreType>;
};

export function validateModule(module: TSCoreModule): string[] {
  const errors: string[] = [];

  if (module.kind !== "TSCoreModule") {
    return ["Expected a TSCoreModule."];
  }

  const records = new Map(module.records.map((record) => [record.name, record]));
  const unions = new Map(module.unions.map((union) => [union.name, union]));
  const constants = new Map(module.constants.map((constant) => [constant.name, constant]));
  const context: TypeContext = { records, unions, constants };

  requireUniqueGeneratedNames(module, errors);
  validateGeneratedIdentifiers(module, errors);

  for (const record of module.records) {
    requireUnique(record.fields.map((field) => field.name), `record ${record.name}`, errors);
    validateTypes(record.fields.map((field) => field.type), context, `record ${record.name}`, errors);
  }

  for (const union of module.unions) {
    requireUnique(union.variants.map((variant) => variant.name), `union ${union.name}`, errors);
    for (const variant of union.variants) {
      validateTypes(variant.fields?.map((field) => field.type) ?? [], context, `variant ${union.name}.${variant.name}`, errors);
    }
  }

  const values = evaluateConstants(module);

  for (const constant of module.constants) {
    const constantContext = { ...context, variables: new Map<string, TSCoreType>() };
    validateTypes([constant.type], context, `constant ${constant.name}`, errors);
    validateExprAgainst(constant.value, constant.type, constantContext, `constant ${constant.name}`, errors);
    validateConstantContracts(constant, context, values, errors);
  }

  for (const fn of module.functions) {
    requireUnique(fn.parameters.map((parameter) => parameter.name), `function ${fn.name}`, errors);
    validateTypes([fn.returns, ...fn.parameters.map((parameter) => parameter.type)], context, `function ${fn.name}`, errors);

    const variables = new Map(fn.parameters.map((parameter) => [parameter.name, parameter.type]));
    validateExprAgainst(fn.body, fn.returns, { ...context, variables }, `function ${fn.name} body`, errors);
    validateFunctionContracts(fn, context, errors);
  }

  for (const machine of module.stateMachines) {
    validateStateMachine(machine, errors);
  }

  return errors;
}

// Values of the constants that evaluate; ones that do not are reported by expression validation.
function evaluateConstants(module: TSCoreModule): Map<string, TSCoreValue> {
  return new Map(
    module.constants.flatMap((constant): Array<[string, TSCoreValue]> => {
      try {
        return [[constant.name, evaluate(constant.value)]];
      } catch {
        return [];
      }
    }),
  );
}

function validateGeneratedIdentifiers(module: TSCoreModule, errors: string[]): void {
  requireIdentifier(module.name, "module name", errors);

  for (const record of module.records) {
    requireIdentifier(record.name, "record name", errors);
    for (const field of record.fields) {
      requireIdentifier(field.name, `field name in record ${record.name}`, errors);
    }
  }

  for (const union of module.unions) {
    requireIdentifier(union.name, "union name", errors);
    requireIdentifier(union.tag, `tag field in union ${union.name}`, errors);
    for (const variant of union.variants) {
      requireIdentifier(variant.name, `variant name in union ${union.name}`, errors);
      for (const field of variant.fields ?? []) {
        requireIdentifier(field.name, `payload field in variant ${union.name}.${variant.name}`, errors);
      }
    }
  }

  for (const constant of module.constants) {
    requireIdentifier(constant.name, "constant name", errors);
  }

  for (const fn of module.functions) {
    requireIdentifier(fn.name, "function name", errors);
    for (const parameter of fn.parameters) {
      requireIdentifier(parameter.name, `parameter name in function ${fn.name}`, errors);
    }
  }

  for (const machine of module.stateMachines) {
    requireIdentifier(machine.name, "state machine name", errors);
    requireIdentifier(machine.stateName, `state type in state machine ${machine.name}`, errors);
    requireIdentifier(machine.actionName, `action type in state machine ${machine.name}`, errors);
    for (const state of machine.states) {
      requireIdentifier(state, `state in state machine ${machine.name}`, errors);
    }

    for (const action of machine.actions) {
      requireIdentifier(action, `action in state machine ${machine.name}`, errors);
    }
  }
}

function requireUniqueGeneratedNames(module: TSCoreModule, errors: string[]): void {
  const generatedNames = [
    ...module.records.map((record) => record.name),
    ...module.unions.map((union) => union.name),
    ...module.constants.map((constant) => constant.name),
    ...module.functions.map((fn) => fn.name),
    ...module.stateMachines.flatMap((machine) => [machine.name, guardName(machine), runName(machine), machine.stateName, machine.actionName]),
  ];

  requireUnique(generatedNames, "generated Lean/TypeScript declarations", errors);
}

// Contract kinds whose theorem only restated the function body (Lean closed them with `rfl`).
// Modules that still use them fail with a migration hint instead of silently losing the contract.
const REMOVED_FUNCTION_CONTRACTS = new Set(["returnsField", "recordConstructor", "returnsVariant", "idempotent", "variantPredicate"]);

function validateFunctionContracts(fn: TSCoreFunction, context: TypeContext, errors: string[]): void {
  for (const contract of fn.contracts ?? []) {
    const kind: string = contract.kind;

    if (REMOVED_FUNCTION_CONTRACTS.has(kind)) {
      errors.push(
        `Function '${fn.name}' uses removed contract '${kind}', which only restated the function body. ` +
          "Delete the contract (the function is still generated), or read the value directly and delete the function.",
      );
      continue;
    }

    if (contract.kind === "returnsStartsWith") {
      if (!isStringType(fn.returns)) {
        errors.push(`Function '${fn.name}' returnsStartsWith contract requires a String return type.`);
        continue;
      }

      if (!exprStartsWithString(fn.body, contract.prefix)) {
        errors.push(`Function '${fn.name}' returnsStartsWith contract requires a body starting with '${contract.prefix}'.`);
      }

      continue;
    }

    if (contract.kind === "returnsEndsWith") {
      if (!isStringType(fn.returns)) {
        errors.push(`Function '${fn.name}' returnsEndsWith contract requires a String return type.`);
        continue;
      }

      if (!exprEndsWithString(fn.body, contract.suffix)) {
        errors.push(`Function '${fn.name}' returnsEndsWith contract requires a body ending with '${contract.suffix}'.`);
      }

      continue;
    }

    if (contract.kind === "nonEmptyFieldsPredicate") {
      const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
      const record = parameter ? namedRecord(parameter.type, context) : undefined;

      if (!parameter || !record) {
        errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate contract requires a record parameter '${contract.parameter}'.`);
        continue;
      }

      if (!isBoolType(fn.returns)) {
        errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate contract requires a Bool return type.`);
      }

      if (contract.fields.length === 0) {
        errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate contract requires at least one field.`);
        continue;
      }

      for (const fieldName of contract.fields) {
        const field = record.fields.find((candidate) => candidate.name === fieldName);
        if (!field) {
          errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate contract references unknown field '${fieldName}'.`);
          continue;
        }

        if (!isStringType(field.type)) {
          errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate field '${fieldName}' must be a String field.`);
        }
      }

      if (!isNonEmptyFieldsExpr(fn.body, contract.parameter, contract.fields)) {
        errors.push(`Function '${fn.name}' nonEmptyFieldsPredicate contract must check the listed fields for non-empty strings.`);
      }

      continue;
    }

    errors.push(`Function '${fn.name}' has unknown contract kind '${kind}'.`);
  }
}

function validateConstantContracts(
  constant: TSCoreConstant,
  context: TypeContext,
  values: ReadonlyMap<string, TSCoreValue>,
  errors: string[],
): void {
  const value = values.get(constant.name);

  for (const contract of constant.contracts ?? []) {
    const problem = constantContractProblem(constant, contract, context);

    if (problem) {
      errors.push(`Constant '${constant.name}' ${contract.kind} contract ${problem}`);
      continue;
    }

    if (value !== undefined && !constantContractHolds(contract, value, values)) {
      const field = "field" in contract ? ` for field '${contract.field}'` : "";
      errors.push(`Constant '${constant.name}' ${contract.kind} contract is false${field}.`);
    }
  }
}

// Why a contract does not fit the constant's type, or null when it does.
function constantContractProblem(constant: TSCoreConstant, contract: TSCoreConstantContract, context: TypeContext): string | null {
  if (contract.kind === "nonEmptyArray") {
    return constant.type.kind === "array" ? null : "requires an array type.";
  }

  if (contract.kind === "fieldEquals") {
    const field = namedRecord(constant.type, context)?.fields.find((candidate) => candidate.name === contract.field);
    if (!field) {
      return `references unknown record field '${contract.field}'.`;
    }
    return isStringType(field.type) ? null : "currently supports String fields only.";
  }

  const field = arrayItemRecord(constant.type, context)?.fields.find((candidate) => candidate.name === contract.field);
  if (!field) {
    return `references unknown item field '${contract.field}'.`;
  }

  if (!isStringType(field.type)) {
    return "currently supports String fields only.";
  }

  if (contract.kind === "allItemsFieldStartsWithOneOf" && contract.prefixes.length === 0) {
    return "requires at least one prefix.";
  }

  if (contract.kind === "allItemsFieldInConstant") {
    const target = context.constants.get(contract.constant);
    const targetField = target ? arrayItemRecord(target.type, context)?.fields.find((candidate) => candidate.name === contract.constantField) : undefined;
    if (!targetField) {
      return `references invalid constant '${contract.constant}'.`;
    }
    if (!isStringType(targetField.type)) {
      return "compares fields with different types.";
    }
  }

  return null;
}

function validateStateMachine(machine: TSCoreStateMachine, errors: string[]): void {
  requireUnique(machine.states, `state machine ${machine.name} states`, errors);
  requireUnique(machine.actions, `state machine ${machine.name} actions`, errors);

  const transitionKeys = new Set<string>();
  for (const transition of machine.transitions) {
    const key = `${transition.from}:${transition.action}`;
    if (transitionKeys.has(key)) {
      errors.push(`State machine '${machine.name}' has duplicate transition for '${transition.from}' and '${transition.action}'.`);
    }

    transitionKeys.add(key);

    if (!machine.states.includes(transition.from)) {
      errors.push(`Transition '${machine.name}' references unknown source state '${transition.from}'.`);
    }

    if (!machine.states.includes(transition.to)) {
      errors.push(`Transition '${machine.name}' references unknown target state '${transition.to}'.`);
    }

    if (!machine.actions.includes(transition.action)) {
      errors.push(`Transition '${machine.name}' references unknown action '${transition.action}'.`);
    }
  }

  for (const state of machine.terminalStates ?? []) {
    if (!machine.states.includes(state)) {
      errors.push(`Terminal state '${state}' is not a state in '${machine.name}'.`);
    }

    const outgoing = machine.transitions.find((transition) => transition.from === state && transition.to !== state);
    if (outgoing) {
      errors.push(`Terminal state '${state}' in '${machine.name}' has an outgoing transition for action '${outgoing.action}'.`);
    }
  }

  const { initialState } = machine;
  if (initialState !== undefined) {
    if (!machine.states.includes(initialState)) {
      errors.push(`Initial state '${initialState}' is not a state in '${machine.name}'.`);
    } else {
      const reachable = reachableFrom(machine, initialState);
      for (const state of machine.states.filter((candidate) => !reachable.has(candidate))) {
        errors.push(`State '${state}' in '${machine.name}' is unreachable from initial state '${initialState}'.`);
      }
    }
  }

  for (const { from, to } of machine.never ?? []) {
    if (!machine.states.includes(from) || !machine.states.includes(to)) {
      errors.push(`State machine '${machine.name}' never property '${from}' -> '${to}' references an unknown state.`);
      continue;
    }

    const path = reachableFrom(machine, from).get(to);
    if (path) {
      errors.push(`State machine '${machine.name}' never property '${from}' -> '${to}' is false: actions [${path.join(", ")}] reach '${to}'.`);
    }
  }
}

function validateTypes(types: TSCoreType[], context: TypeContext, location: string, errors: string[]): void {
  for (const type of types) {
    if (type.kind === "array") {
      validateTypes([type.item], context, location, errors);
    }

    if (type.kind === "named" && !context.records.has(type.name) && !context.unions.has(type.name)) {
      errors.push(`${location} references unknown type '${type.name}'.`);
    }
  }
}

function validateExprAgainst(
  expr: TSCoreExpr,
  expected: TSCoreType,
  context: ExprContext,
  location: string,
  errors: string[],
): void {
  const actual = inferExprType(expr, expected, context, location, errors);
  if (actual && !sameType(actual, expected)) {
    errors.push(`${location} has type '${formatType(actual)}' but expected '${formatType(expected)}'.`);
  }
}

function inferExprType(
  expr: TSCoreExpr,
  expected: TSCoreType | undefined,
  context: ExprContext,
  location: string,
  errors: string[],
): TSCoreType | undefined {
  if (expr.kind === "var") {
    const type = context.variables.get(expr.name);
    if (!type) {
      errors.push(`${location} references unknown variable '${expr.name}'.`);
    }

    return type;
  }

  if (expr.kind === "string") {
    return { kind: "primitive", name: "String" };
  }

  if (expr.kind === "bool") {
    return { kind: "primitive", name: "Bool" };
  }

  if (expr.kind === "nat") {
    if (!Number.isInteger(expr.value) || expr.value < 0) {
      errors.push(`${location} uses a Nat literal that is not a non-negative integer.`);
    }

    return expected?.kind === "primitive" && expected.name === "Int" ? expected : { kind: "primitive", name: "Nat" };
  }

  if (expr.kind === "array") {
    if (!expected || expected.kind !== "array") {
      errors.push(`${location} array expression needs an array expected type.`);
      return undefined;
    }

    expr.items.forEach((item, index) => {
      validateExprAgainst(item, expected.item, context, `${location}[${index}]`, errors);
    });

    return expected;
  }

  if (expr.kind === "concat") {
    if (expr.parts.length === 0) {
      errors.push(`${location} concat expression needs at least one part.`);
    }

    for (const [index, part] of expr.parts.entries()) {
      validateExprAgainst(part, { kind: "primitive", name: "String" }, context, `${location}.concat[${index}]`, errors);
    }

    return { kind: "primitive", name: "String" };
  }

  if (expr.kind === "record") {
    const record = context.records.get(expr.typeName);
    if (!record) {
      errors.push(`${location} constructs unknown record '${expr.typeName}'.`);
      return { kind: "named", name: expr.typeName };
    }

    validateRecordFields(expr, record, context, location, errors);
    return { kind: "named", name: expr.typeName };
  }

  if (expr.kind === "variant") {
    const union = context.unions.get(expr.unionName);
    if (!union) {
      errors.push(`${location} constructs unknown union '${expr.unionName}'.`);
      return { kind: "named", name: expr.unionName };
    }

    validateVariant(expr, union, context, location, errors);
    return { kind: "named", name: expr.unionName };
  }

  if (expr.kind === "isVariant") {
    const targetType = inferExprType(expr.target, undefined, context, `${location}.target`, errors);
    const union = targetType ? namedUnion(targetType, context) : undefined;

    if (!union || union.name !== expr.unionName) {
      errors.push(`${location} tests a target that is not union '${expr.unionName}'.`);
      return { kind: "primitive", name: "Bool" };
    }

    if (expr.tag !== union.tag) {
      errors.push(`${location} uses tag '${expr.tag}' but union '${union.name}' is tagged by '${union.tag}'.`);
    }

    if (!union.variants.some((variant) => variant.name === expr.variant)) {
      errors.push(`${location} references unknown variant '${expr.unionName}.${expr.variant}'.`);
    }

    return { kind: "primitive", name: "Bool" };
  }

  if (expr.kind === "stringNonEmpty") {
    validateExprAgainst(expr.target, { kind: "primitive", name: "String" }, context, `${location}.target`, errors);
    return { kind: "primitive", name: "Bool" };
  }

  if (expr.kind === "and") {
    if (expr.terms.length === 0) {
      errors.push(`${location} and expression needs at least one term.`);
    }

    expr.terms.forEach((term, index) => {
      validateExprAgainst(term, { kind: "primitive", name: "Bool" }, context, `${location}.and[${index}]`, errors);
    });

    return { kind: "primitive", name: "Bool" };
  }

  const targetType = inferExprType(expr.target, undefined, context, `${location}.${expr.field} target`, errors);
  const record = targetType ? namedRecord(targetType, context) : undefined;
  const field = record?.fields.find((candidate) => candidate.name === expr.field);

  if (!record || !field) {
    errors.push(`${location} reads unknown field '${expr.field}'.`);
    return undefined;
  }

  return field.type;
}

function validateRecordFields(
  expr: Extract<TSCoreExpr, { kind: "record" }>,
  record: TSCoreRecord,
  context: ExprContext,
  location: string,
  errors: string[],
): void {
  const expectedFields = new Set(record.fields.map((field) => field.name));
  const actualFields = new Set(Object.keys(expr.fields));

  for (const field of record.fields) {
    const value = expr.fields[field.name];
    if (!value) {
      errors.push(`${location} is missing record field '${field.name}'.`);
      continue;
    }

    validateExprAgainst(value, field.type, context, `${location}.${field.name}`, errors);
  }

  for (const field of actualFields) {
    if (!expectedFields.has(field)) {
      errors.push(`${location} includes unknown record field '${field}'.`);
    }
  }
}

function validateVariant(
  expr: Extract<TSCoreExpr, { kind: "variant" }>,
  union: TSCoreTaggedUnion,
  context: ExprContext,
  location: string,
  errors: string[],
): void {
  if (expr.tag !== union.tag) {
    errors.push(`${location} uses tag '${expr.tag}' but union '${union.name}' is tagged by '${union.tag}'.`);
  }

  const variant = union.variants.find((candidate) => candidate.name === expr.variant);
  if (!variant) {
    errors.push(`${location} references unknown variant '${expr.unionName}.${expr.variant}'.`);
    return;
  }

  const expectedFields = new Set((variant.fields ?? []).map((field) => field.name));
  const actualFields = new Set(Object.keys(expr.fields ?? {}));

  for (const field of variant.fields ?? []) {
    const value = expr.fields?.[field.name];
    if (!value) {
      errors.push(`${location} is missing variant field '${field.name}'.`);
      continue;
    }

    validateExprAgainst(value, field.type, context, `${location}.${field.name}`, errors);
  }

  for (const field of actualFields) {
    if (!expectedFields.has(field)) {
      errors.push(`${location} includes unknown variant field '${field}'.`);
    }
  }
}

function namedRecord(type: TSCoreType, context: TypeContext): TSCoreRecord | undefined {
  return type.kind === "named" ? context.records.get(type.name) : undefined;
}

function namedUnion(type: TSCoreType, context: TypeContext): TSCoreTaggedUnion | undefined {
  return type.kind === "named" ? context.unions.get(type.name) : undefined;
}

function arrayItemRecord(type: TSCoreType, context: TypeContext): TSCoreRecord | undefined {
  return type.kind === "array" ? namedRecord(type.item, context) : undefined;
}

function isNonEmptyFieldsExpr(expr: TSCoreExpr, parameter: string, fields: string[]): boolean {
  const terms = expr.kind === "and" ? expr.terms : [expr];

  if (terms.length !== fields.length) {
    return false;
  }

  return terms.every((term, index) => {
    const field = fields[index];
    return (
      term.kind === "stringNonEmpty" &&
      term.target.kind === "field" &&
      term.target.field === field &&
      term.target.target.kind === "var" &&
      term.target.target.name === parameter
    );
  });
}

function exprStartsWithString(expr: TSCoreExpr, prefix: string): boolean {
  if (expr.kind === "string") {
    return expr.value.startsWith(prefix);
  }

  if (expr.kind === "concat") {
    const [first] = expr.parts;
    return Boolean(first && exprStartsWithString(first, prefix));
  }

  return false;
}

function exprEndsWithString(expr: TSCoreExpr, suffix: string): boolean {
  if (expr.kind === "string") {
    return expr.value === suffix;
  }

  if (expr.kind === "concat") {
    const last = expr.parts.at(-1);
    return Boolean(last && exprEndsWithString(last, suffix));
  }

  return false;
}

function isStringType(type: TSCoreType): boolean {
  return type.kind === "primitive" && type.name === "String";
}

function isBoolType(type: TSCoreType): boolean {
  return type.kind === "primitive" && type.name === "Bool";
}

function sameType(left: TSCoreType, right: TSCoreType): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "primitive" && right.kind === "primitive") {
    return left.name === right.name;
  }

  if (left.kind === "named" && right.kind === "named") {
    return left.name === right.name;
  }

  if (left.kind === "array" && right.kind === "array") {
    return sameType(left.item, right.item);
  }

  return false;
}

function formatType(type: TSCoreType): string {
  if (type.kind === "array") {
    return `Array<${formatType(type.item)}>`;
  }

  return type.name;
}

function requireUnique(values: string[], context: string, errors: string[]): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`Duplicate '${value}' in ${context}.`);
    }

    seen.add(value);
  }
}

function requireIdentifier(value: string, context: string, errors: string[]): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    errors.push(`Invalid ${context} '${value}'. TSCore generated identifiers must match [A-Za-z_][A-Za-z0-9_]*.`);
  }
}
