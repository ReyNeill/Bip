# Getting Started

Bip is an experimental proof-carrying TypeScript tool. A consumer project defines small TSCore modules, Bip emits runtime TypeScript and Lean proof artifacts, and `bip scan` reports which project boundaries are proof-backed.

## Install

The unscoped npm name `bip` is already taken, so the registry package uses `@reyneill/bip`. Install it with an alias so project-owned `bip.config.ts` and TSCore modules can continue importing from `"bip"`:

```sh
bun add --dev bip@npm:@reyneill/bip
```

When developing Bip locally against a consumer project, use a local file dependency instead:

```sh
bun add --dev file:../Bip
```

Then run Bip through the local package binary:

```sh
bunx bip init
bunx bip verify
bunx bip scan
```

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
      name: "generated-artifacts-current",
      command: ["bun", "scripts/check-bip-generated.ts"],
      category: "Project Checks",
      weight: 20,
    },
  ],
});
```

`modules` are proof modules that `bip verify` generates and checks. `checks` are optional project-owned commands that `bip scan` runs as extra gates.

## Define TSCore

Put TSCore source files under the consumer project's `bip/` directory. A small route catalog module looks like this:

```ts
import { defineModule } from "bip";

const StringType = { kind: "primitive", name: "String" } as const;

export default defineModule({
  name: "SiteCore",
  records: [
    {
      kind: "record",
      name: "PageRoute",
      fields: [
        { name: "path", type: StringType },
        { name: "label", type: StringType },
      ],
    },
  ],
  unions: [],
  constants: [
    {
      kind: "constant",
      name: "siteRoutes",
      type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "PageRoute",
            fields: {
              path: { kind: "string", value: "/" },
              label: { kind: "string", value: "Home" },
            },
          },
        ],
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
      ],
    },
  ],
  functions: [
    {
      kind: "function",
      name: "routePath",
      parameters: [{ name: "route", type: { kind: "named", name: "PageRoute" } }],
      returns: StringType,
      body: { kind: "field", target: { kind: "var", name: "route" }, field: "path" },
      contracts: [{ kind: "returnsField", parameter: "route", field: "path" }],
    },
  ],
  stateMachines: [],
});
```

Useful starter boundaries are route catalogs, metadata catalogs, content indexes, API response unions, auth predicates, and reducer state machines.

## Verify

Run verification from the consumer project root:

```sh
bunx bip verify
```

`bip verify` loads `bip.config.ts`, validates each TSCore module, writes generated runtime TypeScript to each module's `outDir`, writes Lean files under `outDir/proofs`, and writes `outDir/proof-manifest.json`.

Lean is optional while scaffolding. If `lean` is on `PATH`, Bip kernel-checks the generated proof files. If not, the manifest records `leanCheck.status` as `skipped`.

For one-off local development in the Bip repo, the equivalent direct command is:

```sh
bun run src/cli.ts verify-core examples/basic-site.tscore.ts --out generated/tscore
```

## Scan

Run the adoption scanner from the consumer project root:

```sh
bunx bip scan
```

`bip scan` prints a human-readable score. It checks configured proof manifests, runs configured project checks, and discovers likely proof boundaries such as metadata, navigation, content catalogs, API routes, auth, reducers, external IO, and runtime schemas.

Findings include a stable rule ID, severity, short explanation, recommendation, location, and affected count when multiple files match. Warnings usually mean Bip found a project boundary that is not visibly backed by generated Bip code.

## Read Manifests

Each generated `proof-manifest.json` describes the proof status for one TSCore module:

```json
{
  "checker": "lean4",
  "source": "bip/site.tscore.ts",
  "leanCheck": {
    "status": "checked",
    "detail": "Lean checked 1 proof file(s)."
  },
  "verifiedExports": [
    {
      "exportName": "siteRoutes",
      "model": "TSCoreConstant",
      "ensures": ["nonEmptyArray", "allItemsFieldUnique"],
      "status": "checked"
    }
  ]
}
```

Treat `checked` as the strongest status. `skipped` means artifacts were generated but Lean was not available. `failed` means the generated proof did not check and should block trust in that module.
