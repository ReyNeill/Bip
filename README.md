# Bip

Bip is an experimental proof-carrying TypeScript package tool.

A TSCore module (a small typed IR written in TypeScript) emits runtime TypeScript and Lean from the same source. Lean proves the module's contracts, and a proof manifest records what was proved so it can travel with a package.

## Commands

```sh
bun install
bun run hooks       # once per clone: pre-commit and pre-push hooks
bun run c           # the full gate: typecheck, lint, dedupe, tests, self staleness
bun run verify:self # regenerate and Lean-check Bip's own module
bun run verify:core # regenerate and Lean-check the example module
bun run scan:self
bun run src/cli.ts init [directory]
```

CI runs `bun run c` on every push to `main`. Contributor notes live in [AGENTS.md](AGENTS.md).

Lean is required to verify. Proofs are checked by one pinned toolchain (`leanprover/lean4:v4.32.0`, recorded in every manifest): with elan installed, `bip verify` runs `elan run --install <toolchain> lean` and installs it on first use; without elan, the `lean` on `PATH` must report that version. If Lean is missing or the version differs, the manifest records the check as `failed` and `bip verify` exits non-zero. Unchecked proofs are never silently accepted.

`tests/emitters.test.ts` is the differential test between the two outputs: it runs the generated TypeScript and the generated Lean on sample inputs and compares both with a TSCore evaluator, so the code apps run cannot drift from the definitions Lean proves things about.

## Release

Releases are manual. Use a minor bump for breaking changes while Bip is 0.x:

```sh
bun run release:patch
bun run release:minor
```

The release script requires a clean git worktree, runs the local checks, bumps the version, commits the bump, packs the package, and publishes it publicly. Pass npm publish flags after the script, for example `bun run release:minor --otp 123456`.

## Project Config

Projects use Bip without modifying the Bip repo:

```sh
bun add -d bip@npm:@reyneill/bip
bunx bip scan
bunx bip init
bunx bip verify
bunx bip scan
bunx bip verify --check
```

The first scan is discovery-only and identifies the boundaries worth proof-backing. `bip init` adds a project-owned `bip.config.ts`:

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

`bip verify` loads the config, generates runtime TypeScript and Lean artifacts for each module, runs Lean, and writes proof manifests.

`bip verify --check` regenerates every configured module in memory, without writing files or running Lean, and exits non-zero listing each generated file (runtime TypeScript, Lean, manifest) that is missing or differs from what is committed. It is `git diff --exit-code` for Bip output: run it in CI or a pre-commit hook instead of a hand-written staleness script.

`bip scan` is the adoption scanner. Its score covers only what Bip can know for certain: configured proof modules (Lean status, the same exact staleness check, manifest health) and configured project checks. It also lists likely proof candidates in app code, as advisory suggestions that never affect the score.

`bip init` creates a starter `bip.config.ts`, `bip/example.tscore.ts`, and a short `AGENTS.md` note.

For installation, config, TSCore authoring, verification, scan output, and proof manifest details, see [Getting Started](docs/getting-started.md).

## Dogfooding

Bip is its own consumer:

```sh
bun run verify:self
bun run check:self
bun run scan:self
bun run scan:published
```

`verify:self`, `check:self`, and `scan:self` run the current source against this repo's `bip.config.ts`. `scan:published` runs the installed `bip@npm:@reyneill/bip` scanner. The self-proof module backs the scan category list and the scan gate state machine (blocked signals keep the status, `error` is terminal, every status is reachable, and `warn` never returns to `clean`), and emits runtime code under `src/generated/bip`.

## TSCore

`bun run verify:core` demonstrates the TSCore IR: one source object emits both runtime TypeScript and Lean. The example models a route catalog, a path builder, and a publish-state machine.

Bip is designed to be consumed by external projects without modifying this repo. A consumer owns its `bip.config.ts`, keeps TSCore modules in its own `bip/` directory, and writes generated artifacts to its own `src/generated/bip` directory. Project-owned adapters can read app data (JSON, TypeScript) and build TSCore modules from it.

Typed builders (`record`, `recordList`, `recordValue`, `stateMachine`) cover the common shapes. TypeScript checks the data against the record's field types and checks every contract's field and state names, so typos fail at compile time.

### What gets generated

Records, unions, and state types become plain TypeScript types, and constants become typed data exports. Consumers read them directly: `siteMetadata.title`, `route.path`. Bip does not generate accessor or constructor wrappers, and a function whose body tests a union variant becomes a TypeScript type guard without any contract.

Functions are available for real logic (string building, predicates). A function without contracts is plain generated code: it is emitted, but it is not listed in the manifest and does not count toward coverage.

### What Bip proves

Every theorem states something beyond the definition, and the manifest counts these properties:

- Constant data, checked by `decide`: `nonEmptyArray`, `allItemsFieldNonEmpty`, `allItemsFieldUnique`, `allItemsFieldStartsWith`, `allItemsFieldStartsWithOneOf`, `allItemsFieldEmptyOrStartsWith`, `allItemsFieldInConstant`, and `fieldEquals` (pins a field to an expected value).
- Functions, for every input: `returnsStartsWith` and `returnsEndsWith` prove string shape for all arguments; `nonEmptyFieldsPredicate` proves that each listed empty field makes the predicate return `false`.
- State machines, quantified over states, actions, or action sequences: actions the guard (for example `canPublishTransition`) blocks leave the state unchanged; terminal states absorb every action; with `initialState`, every state is reachable; each `never: [{ from, to }]` entry proves by induction that no action sequence takes `from` to `to`. Validation rejects unreachable states and false `never` entries before Lean runs, with a witness action sequence.

The transition table itself is the definition, so Bip no longer emits one theorem per row.

### Removed contracts

`returnsField`, `recordConstructor`, `returnsVariant`, `idempotent`, and `variantPredicate` were removed: each proved only that a function equals its own body. A module that still uses one fails validation with a migration hint. To migrate, delete the contract; the function is still generated, so existing imports keep working. Then replace calls such as `pageTitle(page)` with `page.title` and delete the function.
