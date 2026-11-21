import type { TSCoreConstantContract, TSCoreExpr } from "./types.ts";

// A runtime value, shaped exactly like the generated TypeScript: records are plain objects and a
// union variant is an object carrying its tag field.
export type TSCoreValue =
  | string
  | number
  | boolean
  | readonly TSCoreValue[]
  | { readonly [field: string]: TSCoreValue };

export type RecordValue = { readonly [field: string]: TSCoreValue };

// Reference semantics for TSCore expressions. Validation checks constant contracts with it, and the
// emitter tests compare both the generated TypeScript and the generated Lean against it.
export function evaluate(
  expr: TSCoreExpr,
  env: ReadonlyMap<string, TSCoreValue> = new Map(),
): TSCoreValue {
  switch (expr.kind) {
    case "var": {
      const value = env.get(expr.name);
      if (value === undefined) {
        throw new Error(`Unbound variable '${expr.name}'.`);
      }
      return value;
    }
    case "string":
    case "bool":
    case "nat":
      return expr.value;
    case "variant":
      return { [expr.tag]: expr.variant, ...evaluateFields(expr.fields ?? {}, env) };
    case "isVariant":
      return fieldOf(evaluate(expr.target, env), expr.tag) === expr.variant;
    case "stringNonEmpty":
      return evaluate(expr.target, env) !== "";
    case "and":
      return expr.terms.every((term) => evaluate(term, env) === true);
    case "array":
      return expr.items.map((item) => evaluate(item, env));
    case "concat":
      return expr.parts.map((part) => String(evaluate(part, env))).join("");
    case "field":
      return fieldOf(evaluate(expr.target, env), expr.field) ?? missingField(expr.field);
    case "record":
      return evaluateFields(expr.fields, env);
  }
}

// Whether a constant contract holds for the constant's value. `constants` holds the values of the
// module's constants, for contracts that refer to another constant.
export function constantContractHolds(
  contract: TSCoreConstantContract,
  value: TSCoreValue,
  constants: ReadonlyMap<string, TSCoreValue>,
): boolean {
  if (contract.kind === "nonEmptyArray") {
    return isList(value) && value.length > 0;
  }

  if (contract.kind === "fieldEquals") {
    return fieldOf(value, contract.field) === contract.value;
  }

  const fields = itemFields(value, contract.field);

  switch (contract.kind) {
    case "allItemsFieldNonEmpty":
      return fields.every((field) => field !== "");
    case "allItemsFieldUnique":
      return new Set(fields).size === fields.length;
    case "allItemsFieldStartsWith":
      return fields.every((field) => field.startsWith(contract.prefix));
    case "allItemsFieldStartsWithOneOf":
      return fields.every((field) => contract.prefixes.some((prefix) => field.startsWith(prefix)));
    case "allItemsFieldEmptyOrStartsWith":
      return fields.every((field) => field === "" || field.startsWith(contract.prefix));
    case "allItemsFieldInConstant": {
      const target = constants.get(contract.constant);
      const allowed = target === undefined ? [] : itemFields(target, contract.constantField);
      return fields.every((field) => allowed.includes(field));
    }
  }
}

function evaluateFields(
  fields: Record<string, TSCoreExpr>,
  env: ReadonlyMap<string, TSCoreValue>,
): RecordValue {
  return Object.fromEntries(
    Object.entries(fields).map(([field, expr]) => [field, evaluate(expr, env)]),
  );
}

// String values of `field` across an array of records; non-string fields read as "" (validation
// rejects contracts on non-string fields before they are evaluated).
function itemFields(value: TSCoreValue, field: string): string[] {
  return isList(value)
    ? value
        .map((item) => fieldOf(item, field))
        .map((item) => (typeof item === "string" ? item : ""))
    : [];
}

function fieldOf(value: TSCoreValue, field: string): TSCoreValue | undefined {
  return isRecord(value) ? value[field] : undefined;
}

function missingField(field: string): never {
  throw new Error(`Missing field '${field}'.`);
}

function isList(value: TSCoreValue): value is readonly TSCoreValue[] {
  return Array.isArray(value);
}

export function isRecord(value: TSCoreValue): value is RecordValue {
  return typeof value === "object" && !Array.isArray(value);
}
