import type {
  TSCoreConstant,
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

  for (const constant of module.constants) {
    const constantContext = { ...context, variables: new Map<string, TSCoreType>() };
    validateTypes([constant.type], context, `constant ${constant.name}`, errors);
    validateExprAgainst(constant.value, constant.type, constantContext, `constant ${constant.name}`, errors);
    validateConstantContracts(constant, context, errors);
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
    ...module.stateMachines.flatMap((machine) => [machine.name, stateMachineGuardName(machine), machine.stateName, machine.actionName]),
  ];

  requireUnique(generatedNames, "generated Lean/TypeScript declarations", errors);
}

function stateMachineGuardName(machine: TSCoreStateMachine): string {
  return `can${machine.name.slice(0, 1).toUpperCase()}${machine.name.slice(1)}`;
}

function validateFunctionContracts(fn: TSCoreFunction, context: TypeContext, errors: string[]): void {
  for (const contract of fn.contracts ?? []) {
    if (contract.kind === "idempotent") {
      const [parameter] = fn.parameters;
      if (fn.parameters.length !== 1 || !parameter) {
        errors.push(`Function '${fn.name}' idempotent contract requires exactly one parameter.`);
        continue;
      }

      if (!sameType(parameter.type, fn.returns)) {
        errors.push(`Function '${fn.name}' idempotent contract requires its return type to match '${parameter.name}'.`);
      }

      if (fn.body.kind !== "var" || fn.body.name !== parameter.name) {
        errors.push(`Function '${fn.name}' idempotent contract currently requires an identity body.`);
      }

      continue;
    }

    if (contract.kind === "returnsVariant") {
      const union = namedUnion(fn.returns, context);
      if (!union) {
        errors.push(`Function '${fn.name}' returnsVariant contract requires a union return type.`);
        continue;
      }

      const variant = union.variants.find((candidate) => candidate.name === contract.variant);
      if (!variant) {
        errors.push(`Function '${fn.name}' returnsVariant contract references unknown variant '${contract.variant}'.`);
        continue;
      }

      if (fn.body.kind !== "variant" || fn.body.unionName !== union.name || fn.body.variant !== contract.variant) {
        errors.push(`Function '${fn.name}' returnsVariant contract must return '${union.name}.${contract.variant}' directly.`);
      }

      continue;
    }

    if (contract.kind === "recordConstructor") {
      const record = namedRecord(fn.returns, context);
      if (!record) {
        errors.push(`Function '${fn.name}' recordConstructor contract requires a record return type.`);
        continue;
      }

      if (fn.body.kind !== "record" || fn.body.typeName !== record.name) {
        errors.push(`Function '${fn.name}' recordConstructor contract must return record '${record.name}' directly.`);
        continue;
      }

      for (const field of record.fields) {
        const parameter = fn.parameters.find((candidate) => candidate.name === field.name);
        const fieldExpr = fn.body.fields[field.name];

        if (!parameter) {
          errors.push(`Function '${fn.name}' recordConstructor contract requires parameter '${field.name}'.`);
          continue;
        }

        if (!sameType(parameter.type, field.type)) {
          errors.push(`Function '${fn.name}' recordConstructor parameter '${field.name}' does not match the record field type.`);
        }

        if (!fieldExpr || fieldExpr.kind !== "var" || fieldExpr.name !== field.name) {
          errors.push(`Function '${fn.name}' recordConstructor field '${field.name}' must be assigned from parameter '${field.name}'.`);
        }
      }

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

    if (contract.kind === "variantPredicate") {
      const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
      const union = parameter ? namedUnion(parameter.type, context) : undefined;

      if (!parameter || !union) {
        errors.push(`Function '${fn.name}' variantPredicate contract requires a union parameter '${contract.parameter}'.`);
        continue;
      }

      if (!isBoolType(fn.returns)) {
        errors.push(`Function '${fn.name}' variantPredicate contract requires a Bool return type.`);
      }

      if (!union.variants.some((variant) => variant.name === contract.variant)) {
        errors.push(`Function '${fn.name}' variantPredicate contract references unknown variant '${contract.variant}'.`);
        continue;
      }

      if (
        fn.body.kind !== "isVariant" ||
        fn.body.target.kind !== "var" ||
        fn.body.target.name !== contract.parameter ||
        fn.body.unionName !== union.name ||
        fn.body.variant !== contract.variant
      ) {
        errors.push(`Function '${fn.name}' variantPredicate contract must test '${contract.parameter}' for '${union.name}.${contract.variant}'.`);
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

    const parameter = fn.parameters.find((candidate) => candidate.name === contract.parameter);
    if (!parameter) {
      errors.push(`Function '${fn.name}' returnsField contract references unknown parameter '${contract.parameter}'.`);
      continue;
    }

    const record = namedRecord(parameter.type, context);
    if (!record) {
      errors.push(`Function '${fn.name}' returnsField contract parameter '${contract.parameter}' must be a record.`);
      continue;
    }

    const field = record.fields.find((candidate) => candidate.name === contract.field);
    if (!field) {
      errors.push(`Function '${fn.name}' returnsField contract references unknown field '${contract.field}'.`);
      continue;
    }

    if (!sameType(field.type, fn.returns)) {
      errors.push(`Function '${fn.name}' returnsField contract field '${contract.field}' does not match the return type.`);
    }

    if (!isParameterFieldExpr(fn.body, contract.parameter, contract.field)) {
      errors.push(`Function '${fn.name}' returnsField contract must return '${contract.parameter}.${contract.field}' directly.`);
    }
  }
}

function validateConstantContracts(constant: TSCoreConstant, context: TypeContext, errors: string[]): void {
  for (const contract of constant.contracts ?? []) {
    if (contract.kind === "nonEmptyArray") {
      if (constant.type.kind !== "array") {
        errors.push(`Constant '${constant.name}' nonEmptyArray contract requires an array type.`);
        continue;
      }

      if (constant.value.kind !== "array" || constant.value.items.length === 0) {
        errors.push(`Constant '${constant.name}' nonEmptyArray contract is false for the provided value.`);
      }

      continue;
    }

    if (contract.kind === "fieldEquals") {
      const record = namedRecord(constant.type, context);
      const field = record?.fields.find((candidate) => candidate.name === contract.field);
      if (!record || !field) {
        errors.push(`Constant '${constant.name}' fieldEquals contract references unknown record field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' fieldEquals contract currently supports String fields only.`);
        continue;
      }

      const fieldValue = constant.value.kind === "record" ? constant.value.fields[contract.field] : undefined;
      if (!fieldValue || fieldValue.kind !== "string" || fieldValue.value !== contract.value) {
        errors.push(`Constant '${constant.name}' fieldEquals contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    if (contract.kind === "allItemsFieldNonEmpty") {
      const itemRecord = arrayItemRecord(constant.type, context);
      const field = itemRecord?.fields.find((candidate) => candidate.name === contract.field);
      if (!itemRecord || !field) {
        errors.push(`Constant '${constant.name}' allItemsFieldNonEmpty contract references unknown item field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' allItemsFieldNonEmpty contract currently supports String fields only.`);
        continue;
      }

      const values = arrayRecordFieldStrings(constant.value, contract.field);
      if (!values || values.some((value) => value.length === 0)) {
        errors.push(`Constant '${constant.name}' allItemsFieldNonEmpty contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    if (contract.kind === "allItemsFieldUnique") {
      const itemRecord = arrayItemRecord(constant.type, context);
      const field = itemRecord?.fields.find((candidate) => candidate.name === contract.field);
      if (!itemRecord || !field) {
        errors.push(`Constant '${constant.name}' allItemsFieldUnique contract references unknown item field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' allItemsFieldUnique contract currently supports String fields only.`);
        continue;
      }

      const values = arrayRecordFieldStrings(constant.value, contract.field);
      if (!values || new Set(values).size !== values.length) {
        errors.push(`Constant '${constant.name}' allItemsFieldUnique contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    if (contract.kind === "allItemsFieldStartsWith") {
      const itemRecord = arrayItemRecord(constant.type, context);
      const field = itemRecord?.fields.find((candidate) => candidate.name === contract.field);
      if (!itemRecord || !field) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWith contract references unknown item field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWith contract currently supports String fields only.`);
        continue;
      }

      const values = arrayRecordFieldStrings(constant.value, contract.field);
      if (!values || values.some((value) => !value.startsWith(contract.prefix))) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWith contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    if (contract.kind === "allItemsFieldStartsWithOneOf") {
      const itemRecord = arrayItemRecord(constant.type, context);
      const field = itemRecord?.fields.find((candidate) => candidate.name === contract.field);
      if (!itemRecord || !field) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWithOneOf contract references unknown item field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWithOneOf contract currently supports String fields only.`);
        continue;
      }

      if (contract.prefixes.length === 0) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWithOneOf contract requires at least one prefix.`);
        continue;
      }

      const values = arrayRecordFieldStrings(constant.value, contract.field);
      if (!values || values.some((value) => !contract.prefixes.some((prefix) => value.startsWith(prefix)))) {
        errors.push(`Constant '${constant.name}' allItemsFieldStartsWithOneOf contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    if (contract.kind === "allItemsFieldEmptyOrStartsWith") {
      const itemRecord = arrayItemRecord(constant.type, context);
      const field = itemRecord?.fields.find((candidate) => candidate.name === contract.field);
      if (!itemRecord || !field) {
        errors.push(`Constant '${constant.name}' allItemsFieldEmptyOrStartsWith contract references unknown item field '${contract.field}'.`);
        continue;
      }

      if (!isStringType(field.type)) {
        errors.push(`Constant '${constant.name}' allItemsFieldEmptyOrStartsWith contract currently supports String fields only.`);
        continue;
      }

      const values = arrayRecordFieldStrings(constant.value, contract.field);
      if (!values || values.some((value) => value.length > 0 && !value.startsWith(contract.prefix))) {
        errors.push(`Constant '${constant.name}' allItemsFieldEmptyOrStartsWith contract is false for field '${contract.field}'.`);
      }

      continue;
    }

    const sourceRecord = arrayItemRecord(constant.type, context);
    const sourceField = sourceRecord?.fields.find((candidate) => candidate.name === contract.field);
    const targetConstant = context.constants.get(contract.constant);
    const targetRecord = targetConstant ? arrayItemRecord(targetConstant.type, context) : undefined;
    const targetField = targetRecord?.fields.find((candidate) => candidate.name === contract.constantField);

    if (!sourceRecord || !sourceField) {
      errors.push(`Constant '${constant.name}' allItemsFieldInConstant contract references unknown item field '${contract.field}'.`);
      continue;
    }

    if (!targetConstant || !targetRecord || !targetField) {
      errors.push(`Constant '${constant.name}' allItemsFieldInConstant contract references invalid constant '${contract.constant}'.`);
      continue;
    }

    if (!sameType(sourceField.type, targetField.type)) {
      errors.push(`Constant '${constant.name}' allItemsFieldInConstant contract compares fields with different types.`);
      continue;
    }

    if (!isStringType(sourceField.type)) {
      errors.push(`Constant '${constant.name}' allItemsFieldInConstant contract currently supports String fields only.`);
      continue;
    }

    const sourceValues = arrayRecordFieldStrings(constant.value, contract.field);
    const targetValues = arrayRecordFieldStrings(targetConstant.value, contract.constantField);
    if (!sourceValues || !targetValues || sourceValues.some((value) => !targetValues.includes(value))) {
      errors.push(`Constant '${constant.name}' allItemsFieldInConstant contract is false for field '${contract.field}'.`);
    }
  }
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

function arrayRecordFieldStrings(expr: TSCoreExpr, field: string): string[] | undefined {
  if (expr.kind !== "array") {
    return undefined;
  }

  const values: string[] = [];
  for (const item of expr.items) {
    const fieldValue = item.kind === "record" ? item.fields[field] : undefined;
    if (!fieldValue || fieldValue.kind !== "string") {
      return undefined;
    }

    values.push(fieldValue.value);
  }

  return values;
}

function isParameterFieldExpr(expr: TSCoreExpr, parameter: string, field: string): boolean {
  return expr.kind === "field" && expr.field === field && expr.target.kind === "var" && expr.target.name === parameter;
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
