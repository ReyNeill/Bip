# Getting Started

Bip is an experimental proof-carrying TypeScript tool. A consumer project defines small TSCore modules, Bip emits runtime TypeScript and Lean proof artifacts, and `bip scan` reports which project boundaries are proof-backed.

## Install

The unscoped npm name `bip` is already taken, so the registry package uses `@reyneill/bip`. Install it with the shortest practical alias command so project-owned `bip.config.ts` and TSCore modules can still import from `"bip"`:

```sh
bun add -d bip@npm:@reyneill/bip
```

When developing Bip locally against a consumer project, use a local file dependency instead:

```sh
bun add -d file:../Bip
```

Then run the first-time loop from the project root:

```sh
bunx bip scan
bunx bip init
bunx bip verify
bunx bip scan
```

The first scan is discovery-only and tells you which boundaries are worth proof-backing. `init` adds the starter config/module, `verify` generates the proof artifacts, and the second scan measures the new proof coverage.

`bip init` accepts an optional target directory:

```sh
bunx bip init ../my-app
```

## Add Config

Create `bip.config.ts` at the project root:

```ts
import { defineBipConfig } from "bip";

export default defineBipConfig({
  modules: [
    {
      name: "site",
      source: "bip/site.tscore.ts",
      outDir: "src/generated/bip/site",
      category: "Site Proofs",
      weight: 30,
    },
  ],
  checks: [
    {
      name: "typecheck",
      command: ["bun", "run", "typecheck"],
      category: "Project Checks",
      weight: 20,
    },
  ],
});
```

`modules` are proof modules that `bip verify` generates and checks. `checks` are optional project-owned commands that `bip scan` runs as extra gates. You do not need a check for generated-artifact staleness: `bip scan` and `bip verify --check` do that themselves.

## Define TSCore

Put TSCore source files under the consumer project's `bip/` directory. The typed builders cover records, record constants, and state machines; other declarations use the TSCore IR directly:

```ts
import { defineModule, record, recordList, stateMachine } from "bip";

const StringType = { kind: "primitive", name: "String" } as const;
const PageRoute = record("PageRoute", { path: "String", label: "String" });

export default defineModule({
  name: "SiteCore",
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
```

`recordList` contracts are keyed by field name, so `unique: ["paht"]` or `startsWith` on a non-string field is a type error. `stateMachine` checks every transition, initial, terminal, and `never` state against `states`.

App code imports the generated types and data and reads them directly:

```ts
import { canPublishTransition, publishTransition, siteRoutes, writingHref } from "@/generated/bip/site/runtime/SiteCore";

const links = siteRoutes.map((route) => ({ href: route.path, label: route.label }));
const postLink = writingHref("bip");
const next = canPublishTransition(state, "publish") ? publishTransition(state, "publish") : state;
```

Bip does not generate field accessors or record/variant constructors: a theorem that `routePath route = route.path` only restates the definition. The removed `returnsField`, `recordConstructor`, `returnsVariant`, `idempotent`, and `variantPredicate` contracts fail validation with a migration hint. Delete such a contract (the function itself still generates), then switch callers to direct field reads and delete the function. A function whose body is an `isVariant` test on a parameter becomes a TypeScript type guard automatically.

What the theorems prove:

- `decide` checks on constant data: non-empty, unique, prefixes, membership in another constant, pinned values.
- String shape for every input (`returnsStartsWith`, `returnsEndsWith`) and predicate behavior (`nonEmptyFieldsPredicate`).
- State machines: guard-blocked actions keep the state, terminal states absorb every action, every state is reachable from `initialState`, and no action sequence breaks a `never` entry. Validation rejects unreachable states and false `never` entries first, printing the action sequence that breaks them.

Useful starter boundaries are route catalogs, metadata catalogs, content indexes, API response unions, auth predicates, and reducer state machines.

## Verify

Run verification from the consumer project root:

```sh
bunx bip verify
```

`bip verify` loads `bip.config.ts`, validates each TSCore module, writes generated runtime TypeScript to each module's `outDir`, writes Lean files under `outDir/proofs`, and writes `outDir/proof-manifest.json`.

Lean is required to verify, at the toolchain Bip pins (`leanprover/lean4:v4.32.0`). With elan installed, Bip runs that toolchain through `elan run --install`, installing it on first use. Without elan, the `lean` on `PATH` must report the same version. If Lean is missing or the version differs, the manifest records `leanCheck.status` as `failed` and the command exits non-zero with install instructions.

## Check Generated Artifacts

Commit the generated files, then gate CI (or a pre-commit hook) on:

```sh
bunx bip verify --check
```

It regenerates every configured module in memory, without writing files or running Lean, and exits non-zero listing each runtime TypeScript, Lean, or manifest file that is missing or differs from the committed copy. A committed manifest that records a failed Lean check also counts as stale. Fix it by running `bunx bip verify` and committing the result.

For one-off local development in the Bip repo, the equivalent direct command is:

```sh
bun run src/cli.ts verify-core examples/basic-site.tscore.ts --out generated/tscore
```

## Scan

Run the adoption scanner from the consumer project root:

```sh
bunx bip scan
```

`bip scan` prints a human-readable score. The score covers configured proof modules (Lean status, stale generated artifacts via the same check as `bip verify --check`, manifest health) and configured project checks, and the summary counts the properties proved across checked modules.

It also lists likely proof candidates in app code (metadata, navigation, content catalogs, API routes, auth, reducers, external IO, runtime schemas) that do not import generated Bip code yet. These are heuristic, so they appear as advisory suggestions and never change the score.

Findings include a stable rule ID, severity, short explanation, recommendation, location, and affected count when multiple files match.

## Read Manifests

Each generated `proof-manifest.json` describes one TSCore module: the pinned Lean toolchain, the Lean result, and every proved property with its theorem:

```json
{
  "checker": "lean4",
  "toolchain": "leanprover/lean4:v4.32.0",
  "source": "bip/site.tscore.ts",
  "proofFile": "proofs/SiteCore.lean",
  "leanCheck": {
    "status": "checked",
    "detail": "Lean checked 1 proof file(s)."
  },
  "verifiedExports": [
    {
      "exportName": "siteRoutes",
      "model": "TSCoreConstant",
      "properties": [
        { "statement": "siteRoutes is non-empty", "theorem": "Bip.Generated.TSCore.siteRoutes_nonempty" },
        { "statement": "path is unique across siteRoutes", "theorem": "Bip.Generated.TSCore.siteRoutes_all_path_unique" }
      ]
    }
  ]
}
```

`verifiedExports` lists only exports with at least one proved property, so generated code without contracts never inflates coverage. Manifests contain no timestamps; they change only when the module (or the pinned toolchain) does.

Treat `checked` as the strongest status. `skipped` means there were no proof files to check. `failed` means the generated proof did not check, or Lean was missing or at the wrong version, and should block trust in that module.
