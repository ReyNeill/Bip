import { defineModule, record, recordList, stateMachine } from "../src/index.ts";

const StringType = { kind: "primitive", name: "String" } as const;
const PageRoute = record("PageRoute", { path: "String", label: "String" });

export default defineModule({
  name: "BasicSiteCore",
  records: [PageRoute],
  unions: [],
  constants: [
    recordList("siteRoutes", PageRoute, [{ path: "/", label: "Home" }], {
      nonEmpty: true,
      unique: ["path"],
      startsWith: { path: "/" },
    }),
  ],
  functions: [
    {
      kind: "function",
      name: "writingHref",
      parameters: [{ name: "slug", type: StringType }],
      returns: StringType,
      body: {
        kind: "concat",
        parts: [
          { kind: "string", value: "/writing/" },
          { kind: "var", name: "slug" },
        ],
      },
      contracts: [{ kind: "returnsStartsWith", prefix: "/writing/" }],
    },
  ],
  stateMachines: [
    stateMachine({
      name: "publishTransition",
      stateName: "PublishState",
      actionName: "PublishAction",
      states: ["draft", "published", "archived"],
      actions: ["publish", "archive", "edit"],
      initialState: "draft",
      terminalStates: ["archived"],
      never: [{ from: "published", to: "draft" }],
      transitions: [
        { from: "draft", action: "publish", to: "published" },
        { from: "published", action: "archive", to: "archived" },
      ],
    }),
  ],
});
