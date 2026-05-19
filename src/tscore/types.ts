export type TSCoreModule = {
  kind: "TSCoreModule";
  name: string;
  records: TSCoreRecord[];
  unions: TSCoreTaggedUnion[];
  constants: TSCoreConstant[];
  functions: TSCoreFunction[];
  stateMachines: TSCoreStateMachine[];
};

export type TSCoreType =
  | { kind: "primitive"; name: "String" | "Bool" | "Nat" | "Int" }
  | { kind: "named"; name: string }
  | { kind: "array"; item: TSCoreType };

export type TSCoreRecord = {
  kind: "record";
  name: string;
  fields: TSCoreField[];
};

export type TSCoreField = {
  name: string;
  type: TSCoreType;
};

export type TSCoreTaggedUnion = {
  kind: "taggedUnion";
  name: string;
  tag: string;
  variants: TSCoreVariant[];
};

export type TSCoreVariant = {
  name: string;
  fields?: TSCoreField[];
};

export type TSCoreFunction = {
  kind: "function";
  name: string;
  parameters: TSCoreParameter[];
  returns: TSCoreType;
  body: TSCoreExpr;
  contracts?: TSCoreFunctionContract[];
};

export type TSCoreConstant = {
  kind: "constant";
  name: string;
  type: TSCoreType;
  value: TSCoreExpr;
  contracts?: TSCoreConstantContract[];
};

export type TSCoreParameter = {
  name: string;
  type: TSCoreType;
};

export type TSCoreExpr =
  | { kind: "var"; name: string }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "nat"; value: number }
  | { kind: "variant"; unionName: string; tag: string; variant: string; fields?: Record<string, TSCoreExpr> }
  | { kind: "isVariant"; target: TSCoreExpr; unionName: string; tag: string; variant: string }
  | { kind: "stringNonEmpty"; target: TSCoreExpr }
  | { kind: "and"; terms: TSCoreExpr[] }
  | { kind: "array"; items: TSCoreExpr[] }
  | { kind: "concat"; parts: TSCoreExpr[] }
  | { kind: "field"; target: TSCoreExpr; field: string }
  | { kind: "record"; typeName: string; fields: Record<string, TSCoreExpr> };

export type TSCoreFunctionContract =
  | { kind: "idempotent" }
  | { kind: "returnsField"; parameter: string; field: string }
  | { kind: "recordConstructor" }
  | { kind: "returnsVariant"; variant: string }
  | { kind: "returnsStartsWith"; prefix: string }
  | { kind: "returnsEndsWith"; suffix: string }
  | { kind: "variantPredicate"; parameter: string; variant: string }
  | { kind: "nonEmptyFieldsPredicate"; parameter: string; fields: string[] };

export type TSCoreConstantContract =
  | { kind: "nonEmptyArray" }
  | { kind: "fieldEquals"; field: string; value: string }
  | { kind: "allItemsFieldNonEmpty"; field: string }
  | { kind: "allItemsFieldUnique"; field: string }
  | { kind: "allItemsFieldStartsWith"; field: string; prefix: string }
  | { kind: "allItemsFieldStartsWithOneOf"; field: string; prefixes: string[] }
  | { kind: "allItemsFieldEmptyOrStartsWith"; field: string; prefix: string }
  | { kind: "allItemsFieldInConstant"; field: string; constant: string; constantField: string };

export type TSCoreStateMachine = {
  kind: "stateMachine";
  name: string;
  stateName: string;
  actionName: string;
  states: string[];
  actions: string[];
  transitions: TSCoreTransition[];
  terminalStates?: string[];
};

export type TSCoreTransition = {
  from: string;
  action: string;
  to: string;
};
