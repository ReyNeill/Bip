import type {
  TSCoreConstant,
  TSCoreConstantContract,
  TSCoreExpr,
  TSCoreRecord,
  TSCoreStateMachine,
} from "./types.ts";

// Typed builders for the common TSCore shapes. They produce plain IR, but TypeScript checks the data
// against the record's field types and checks every contract's field names, so a typo fails at
// compile time instead of during validation.

type PrimitiveName = "String" | "Bool" | "Nat";
type FieldTypes = Readonly<Record<string, PrimitiveName>>;
type PrimitiveValue<P extends PrimitiveName> = P extends "String"
  ? string
  : P extends "Bool"
    ? boolean
    : number;
type StringField<F extends FieldTypes> = {
  [K in keyof F]: F[K] extends "String" ? K : never;
}[keyof F] &
  string;

export type RecordValueOf<F extends FieldTypes> = { readonly [K in keyof F]: PrimitiveValue<F[K]> };

// A record declaration that keeps its field types for the builders below.
export type TypedRecord<F extends FieldTypes> = TSCoreRecord & { fieldTypes: F };

export function record<const F extends FieldTypes>(name: string, fieldTypes: F): TypedRecord<F> {
  return {
    kind: "record",
    name,
    fields: Object.entries(fieldTypes).map(([field, type]) => ({
      name: field,
      type: { kind: "primitive", name: type },
    })),
    fieldTypes,
  };
}

// Contracts for an array of records, keyed by field name. A `startsWith` array means "one of".
export type RecordListContracts<F extends FieldTypes> = {
  nonEmpty?: boolean;
  nonEmptyFields?: readonly StringField<F>[];
  unique?: readonly StringField<F>[];
  startsWith?: { readonly [K in StringField<F>]?: string | readonly string[] };
  emptyOrStartsWith?: { readonly [K in StringField<F>]?: string };
  in?: { readonly [K in StringField<F>]?: { constant: string; field: string } };
};

export function recordList<F extends FieldTypes>(
  name: string,
  of: TypedRecord<F>,
  items: readonly RecordValueOf<F>[],
  contracts: RecordListContracts<F> = {},
): TSCoreConstant {
  const list: TSCoreConstantContract[] = [
    ...(contracts.nonEmpty ? [{ kind: "nonEmptyArray" } as const] : []),
    ...(contracts.nonEmptyFields ?? []).map(
      (field) => ({ kind: "allItemsFieldNonEmpty", field }) as const,
    ),
    ...(contracts.unique ?? []).map((field) => ({ kind: "allItemsFieldUnique", field }) as const),
    ...defined<string | readonly string[]>(contracts.startsWith).map(
      ([field, prefix]): TSCoreConstantContract =>
        typeof prefix === "string"
          ? { kind: "allItemsFieldStartsWith", field, prefix }
          : { kind: "allItemsFieldStartsWithOneOf", field, prefixes: [...prefix] },
    ),
    ...defined<string>(contracts.emptyOrStartsWith).map(
      ([field, prefix]) => ({ kind: "allItemsFieldEmptyOrStartsWith", field, prefix }) as const,
    ),
    ...defined<{ constant: string; field: string }>(contracts.in).map(
      ([field, target]) =>
        ({
          kind: "allItemsFieldInConstant",
          field,
          constant: target.constant,
          constantField: target.field,
        }) as const,
    ),
  ];

  return {
    kind: "constant",
    name,
    type: { kind: "array", item: { kind: "named", name: of.name } },
    value: { kind: "array", items: items.map((item) => recordExpr(of, item)) },
    contracts: list,
  };
}

// A single-record constant. `equals` pins string fields to expected values.
export function recordValue<F extends FieldTypes>(
  name: string,
  of: TypedRecord<F>,
  value: RecordValueOf<F>,
  contracts: { equals?: { readonly [K in StringField<F>]?: string } } = {},
): TSCoreConstant {
  return {
    kind: "constant",
    name,
    type: { kind: "named", name: of.name },
    value: recordExpr(of, value),
    contracts: defined<string>(contracts.equals).map(([field, expected]) => ({
      kind: "fieldEquals",
      field,
      value: expected,
    })),
  };
}

// A state machine whose transitions, initial, terminal, and `never` states must name declared
// states and actions.
export function stateMachine<const S extends string, const A extends string>(machine: {
  name: string;
  stateName: string;
  actionName: string;
  states: readonly S[];
  actions: readonly A[];
  transitions: ReadonlyArray<{ from: NoInfer<S>; action: NoInfer<A>; to: NoInfer<S> }>;
  initialState?: NoInfer<S>;
  terminalStates?: readonly NoInfer<S>[];
  never?: ReadonlyArray<{ from: NoInfer<S>; to: NoInfer<S> }>;
}): TSCoreStateMachine {
  return {
    kind: "stateMachine",
    name: machine.name,
    stateName: machine.stateName,
    actionName: machine.actionName,
    states: [...machine.states],
    actions: [...machine.actions],
    transitions: machine.transitions.map((transition) => ({ ...transition })),
    initialState: machine.initialState,
    terminalStates: machine.terminalStates ? [...machine.terminalStates] : undefined,
    never: machine.never?.map((entry) => ({ ...entry })),
  };
}

function recordExpr<F extends FieldTypes>(of: TypedRecord<F>, value: RecordValueOf<F>): TSCoreExpr {
  const fields: Readonly<Record<string, string | number | boolean>> = value;

  return {
    kind: "record",
    typeName: of.name,
    fields: Object.fromEntries(
      Object.keys(of.fieldTypes).map((field) => [field, literal(fields[field] ?? "")]),
    ),
  };
}

function literal(value: string | number | boolean): TSCoreExpr {
  return typeof value === "string"
    ? { kind: "string", value }
    : typeof value === "boolean"
      ? { kind: "bool", value }
      : { kind: "nat", value };
}

// The set entries of a partial field map.
function defined<V>(
  map: { readonly [field: string]: V | undefined } | undefined,
): Array<[string, V]> {
  return Object.entries(map ?? {}).flatMap(
    ([field, value]): Array<[string, V]> => (value === undefined ? [] : [[field, value]]),
  );
}
