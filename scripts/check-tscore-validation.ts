import { record, recordList, recordValue, stateMachine } from "../src/tscore/build.ts";
import { defineModule } from "../src/tscore/define.ts";
import type { TSCoreExpr, TSCoreModule } from "../src/tscore/types.ts";
import { validateModule } from "../src/tscore/validate.ts";

const StringType = { kind: "primitive", name: "String" } as const;

const validModule = defineModule({
  name: "ValidationSmoke",
  records: [
    {
      kind: "record",
      name: "Route",
      fields: [
        { name: "path", type: StringType },
        { name: "label", type: StringType },
      ],
    },
  ],
  unions: [
    {
      kind: "taggedUnion",
      name: "PageKind",
      tag: "kind",
      variants: [{ name: "home" }],
    },
    {
      kind: "taggedUnion",
      name: "RouteResult",
      tag: "status",
      variants: [
        { name: "success", fields: [{ name: "path", type: StringType }] },
        { name: "error", fields: [{ name: "message", type: StringType }] },
      ],
    },
  ],
  constants: [
    {
      kind: "constant",
      name: "routes",
      type: { kind: "array", item: { kind: "named", name: "Route" } },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "Route",
            fields: {
              path: { kind: "string", value: "/" },
              label: { kind: "string", value: "Home" },
            },
          },
        ],
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldNonEmpty", field: "path" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
        { kind: "allItemsFieldStartsWithOneOf", field: "path", prefixes: ["/", "https://"] },
      ],
    },
    {
      kind: "constant",
      name: "homeKind",
      type: { kind: "named", name: "PageKind" },
      value: { kind: "variant", unionName: "PageKind", tag: "kind", variant: "home" },
    },
  ],
  functions: [
    {
      kind: "function",
      name: "routePath",
      parameters: [{ name: "route", type: { kind: "named", name: "Route" } }],
      returns: StringType,
      body: { kind: "field", target: { kind: "var", name: "route" }, field: "path" },
    },
    {
      kind: "function",
      name: "routeResult",
      parameters: [{ name: "route", type: { kind: "named", name: "Route" } }],
      returns: { kind: "named", name: "RouteResult" },
      body: {
        kind: "variant",
        unionName: "RouteResult",
        tag: "status",
        variant: "success",
        fields: {
          path: { kind: "field", target: { kind: "var", name: "route" }, field: "path" },
        },
      },
    },
    {
      kind: "function",
      name: "isRouteSuccess",
      parameters: [{ name: "result", type: { kind: "named", name: "RouteResult" } }],
      returns: { kind: "primitive", name: "Bool" },
      body: {
        kind: "isVariant",
        target: { kind: "var", name: "result" },
        unionName: "RouteResult",
        tag: "status",
        variant: "success",
      },
    },
    {
      kind: "function",
      name: "routeUrl",
      parameters: [{ name: "slug", type: StringType }],
      returns: StringType,
      body: {
        kind: "concat",
        parts: [
          { kind: "string", value: "/" },
          { kind: "var", name: "slug" },
          { kind: "string", value: "/" },
        ],
      },
      contracts: [
        { kind: "returnsStartsWith", prefix: "/" },
        { kind: "returnsEndsWith", suffix: "/" },
      ],
    },
  ],
  stateMachines: [
    {
      kind: "stateMachine",
      name: "transition",
      stateName: "State",
      actionName: "Action",
      states: ["draft", "archived"],
      actions: ["archive", "edit"],
      transitions: [{ from: "draft", action: "archive", to: "archived" }],
      initialState: "draft",
      terminalStates: ["archived"],
      never: [{ from: "archived", to: "draft" }],
    },
  ],
});

assertNoErrors("valid module", validModule);
assertError(
  "missing record field",
  withRouteFields({ path: { kind: "string", value: "/" } }),
  "missing record field 'label'",
);
assertError(
  "unknown variant",
  replaceConstant("homeKind", {
    kind: "variant",
    unionName: "PageKind",
    tag: "kind",
    variant: "missing",
  }),
  "unknown variant 'PageKind.missing'",
);
assertError(
  "missing variant field",
  {
    ...validModule,
    functions: [
      {
        kind: "function",
        name: "badResult",
        parameters: [{ name: "route", type: { kind: "named", name: "Route" } }],
        returns: { kind: "named", name: "RouteResult" },
        body: { kind: "variant", unionName: "RouteResult", tag: "status", variant: "success" },
      },
    ],
  },
  "missing variant field 'path'",
);
assertError(
  "false fieldEquals contract",
  {
    ...validModule,
    constants: [
      ...validModule.constants,
      {
        kind: "constant",
        name: "route",
        type: { kind: "named", name: "Route" },
        value: routeValue({ path: "/", label: "Home" }),
        contracts: [{ kind: "fieldEquals", field: "label", value: "Writing" }],
      },
    ],
  },
  "fieldEquals contract is false",
);
assertError(
  "duplicate unique field",
  {
    ...validModule,
    constants: [
      {
        kind: "constant",
        name: "duplicateRoutes",
        type: { kind: "array", item: { kind: "named", name: "Route" } },
        value: {
          kind: "array",
          items: [
            routeValue({ path: "/", label: "Home" }),
            routeValue({ path: "/", label: "Duplicate" }),
          ],
        },
        contracts: [{ kind: "allItemsFieldUnique", field: "path" }],
      },
    ],
  },
  "allItemsFieldUnique contract is false",
);
assertError(
  "bad field prefix",
  {
    ...validModule,
    constants: [
      {
        kind: "constant",
        name: "badRoutePrefix",
        type: { kind: "array", item: { kind: "named", name: "Route" } },
        value: {
          kind: "array",
          items: [routeValue({ path: "writing", label: "Writing" })],
        },
        contracts: [{ kind: "allItemsFieldStartsWith", field: "path", prefix: "/" }],
      },
    ],
  },
  "allItemsFieldStartsWith contract is false",
);
assertError(
  "bad optional field prefix",
  {
    ...validModule,
    constants: [
      {
        kind: "constant",
        name: "badOptionalRoutePrefix",
        type: { kind: "array", item: { kind: "named", name: "Route" } },
        value: {
          kind: "array",
          items: [routeValue({ path: "writing", label: "Writing" })],
        },
        contracts: [{ kind: "allItemsFieldEmptyOrStartsWith", field: "path", prefix: "/" }],
      },
    ],
  },
  "allItemsFieldEmptyOrStartsWith contract is false",
);
assertError(
  "bad one-of field prefix",
  {
    ...validModule,
    constants: [
      {
        kind: "constant",
        name: "badRoutePrefixSet",
        type: { kind: "array", item: { kind: "named", name: "Route" } },
        value: {
          kind: "array",
          items: [routeValue({ path: "ftp://example.com", label: "External" })],
        },
        contracts: [
          { kind: "allItemsFieldStartsWithOneOf", field: "path", prefixes: ["/", "https://"] },
        ],
      },
    ],
  },
  "allItemsFieldStartsWithOneOf contract is false",
);
assertError(
  "bad returnsStartsWith body",
  {
    ...validModule,
    functions: [
      {
        kind: "function",
        name: "badRouteUrl",
        parameters: [{ name: "slug", type: StringType }],
        returns: StringType,
        body: {
          kind: "concat",
          parts: [
            { kind: "var", name: "slug" },
            { kind: "string", value: "/" },
          ],
        },
        contracts: [{ kind: "returnsStartsWith", prefix: "/" }],
      },
    ],
  },
  "returnsStartsWith contract requires a body starting with '/'",
);
assertError(
  "bad returnsEndsWith body",
  {
    ...validModule,
    functions: [
      {
        kind: "function",
        name: "badRouteSuffix",
        parameters: [{ name: "slug", type: StringType }],
        returns: StringType,
        body: {
          kind: "concat",
          parts: [
            { kind: "string", value: "/" },
            { kind: "var", name: "slug" },
          ],
        },
        contracts: [{ kind: "returnsEndsWith", suffix: "/" }],
      },
    ],
  },
  "returnsEndsWith contract requires a body ending with '/'",
);
// Untyped modules (for example ones built by a project adapter) can still carry contracts that
// were removed because their theorem only restated the function body.
for (const kind of [
  "returnsField",
  "recordConstructor",
  "returnsVariant",
  "idempotent",
  "variantPredicate",
]) {
  const [routePath] = validModule.functions;
  const legacy: unknown = { ...validModule, functions: [{ ...routePath, contracts: [{ kind }] }] };
  assertError(
    `removed ${kind} contract`,
    legacy as TSCoreModule,
    `uses removed contract '${kind}'`,
  );
}

assertError(
  "bad generated identifier",
  {
    ...validModule,
    stateMachines: [
      {
        kind: "stateMachine",
        name: "bad-transition",
        stateName: "State",
        actionName: "Action",
        states: ["draft"],
        actions: ["edit"],
        transitions: [],
      },
    ],
  },
  "Invalid state machine name 'bad-transition'",
);
assertError(
  "duplicate state transition",
  {
    ...validModule,
    stateMachines: [
      {
        kind: "stateMachine",
        name: "duplicateTransition",
        stateName: "State",
        actionName: "Action",
        states: ["draft", "archived"],
        actions: ["archive"],
        transitions: [
          { from: "draft", action: "archive", to: "archived" },
          { from: "draft", action: "archive", to: "draft" },
        ],
      },
    ],
  },
  "duplicate transition for 'draft' and 'archive'",
);

const [machine] = validModule.stateMachines;
if (!machine) {
  throw new Error("valid module needs a state machine");
}
assertError(
  "unreachable state",
  { ...validModule, stateMachines: [{ ...machine, states: [...machine.states, "orphan"] }] },
  "State 'orphan' in 'transition' is unreachable from initial state 'draft'",
);
assertError(
  "false never property",
  { ...validModule, stateMachines: [{ ...machine, never: [{ from: "draft", to: "archived" }] }] },
  "never property 'draft' -> 'archived' is false: actions [archive] reach 'archived'",
);

// Typed builders: `bun run typecheck` enforces the @ts-expect-error lines, and the built module
// must validate like hand-written IR.
const Link = record("Link", { href: "String", label: "String", order: "Nat" });
const builtModule = defineModule({
  name: "BuilderSmoke",
  records: [Link],
  unions: [],
  constants: [
    recordList("links", Link, [{ href: "/", label: "Home", order: 1 }], {
      nonEmpty: true,
      unique: ["href"],
      startsWith: { href: ["/", "https://"] },
      // @ts-expect-error order is not a String field
      emptyOrStartsWith: { order: "/" },
    }),
    // @ts-expect-error label must be a string
    recordValue("badLink", Link, { href: "/", label: 1, order: 1 }),
  ],
  functions: [],
  stateMachines: [
    stateMachine({
      name: "linkState",
      stateName: "LinkState",
      actionName: "LinkAction",
      states: ["live", "hidden"],
      actions: ["hide"],
      initialState: "live",
      // @ts-expect-error "gone" is not a declared state
      transitions: [{ from: "live", action: "hide", to: "gone" }],
    }),
  ],
});
assertError(
  "typed builder data",
  builtModule,
  "allItemsFieldEmptyOrStartsWith contract currently supports String fields only",
);

console.log("TSCore validation smoke tests passed.");

function assertNoErrors(name: string, module: TSCoreModule): void {
  const errors = validateModule(module);
  if (errors.length > 0) {
    throw new Error(`${name} produced unexpected errors:\n${errors.join("\n")}`);
  }
}

function assertError(name: string, module: TSCoreModule, expected: string): void {
  const errors = validateModule(module);
  if (!errors.some((error) => error.includes(expected))) {
    throw new Error(`${name} did not include '${expected}'. Actual errors:\n${errors.join("\n")}`);
  }
}

function withRouteFields(fields: Record<string, TSCoreExpr>): TSCoreModule {
  return replaceConstant("routes", {
    kind: "array",
    items: [{ kind: "record", typeName: "Route", fields }],
  });
}

function replaceConstant(
  name: string,
  value: TSCoreModule["constants"][number]["value"],
): TSCoreModule {
  return {
    ...validModule,
    constants: validModule.constants.map((constant) =>
      constant.name === name ? { ...constant, value } : constant,
    ),
  };
}

function routeValue(fields: {
  path: string;
  label: string;
}): TSCoreModule["constants"][number]["value"] {
  return {
    kind: "record",
    typeName: "Route",
    fields: {
      path: { kind: "string", value: fields.path },
      label: { kind: "string", value: fields.label },
    },
  };
}
