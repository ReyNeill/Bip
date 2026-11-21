# Bip

Bip turns TSCore modules (a small typed IR written in TypeScript) into runtime TypeScript and Lean
proofs, and writes a manifest of what Lean proved. Read the README for the product; this file is how
to change it.

## Principles

- Deletion first. Do not keep machinery because it exists; prefer the smallest model that makes the
  behavior obvious.
- A theorem must state something beyond the definition it is about. Never add contracts whose proof
  only restates a function body or a table row.
- Typed TypeScript without `any` or casting wrappers; let inference carry types.
- Bun only (never npm or pnpm). No Docker.

## Layout

- `src/tscore/`: the IR (`types.ts`), validation, the evaluator (reference semantics), the two
  emitters (`emit-ts.ts`, `emit-lean.ts`), state-machine helpers, and the typed builders.
- `src/commands/`: CLI commands (`verify`, `verify --check`, `scan`, `init`).
- `src/lean/check.ts`: runs the pinned Lean toolchain (`LEAN_TOOLCHAIN`).
- `bip/`: Bip's own TSCore module, generated into `src/generated/bip` and used by `src/`.
- `examples/`, `generated/tscore/`: the example module and its committed output.
- `tests/`: `bun test` suites.

## Checking a change

- `bun run c` is the full gate: typecheck (`bun check`), Biome, `bun dedupe --check`, `bun test`,
  and `verify --check` on Bip's own module. Run it before every push; CI runs the same on `main`.
- After changing an emitter or `bip/`, run `bun run verify:self` and `bun run verify:core`, then
  commit the regenerated files. Never edit generated files by hand.
- Lean is pinned in `src/lean/check.ts`. Changing the pin regenerates every manifest; rerun both
  verify scripts.
- `bun run hooks` installs the pre-commit (Biome on staged files) and pre-push (typecheck, lint,
  staleness) hooks for a clone.

## Tests

Add a test only when it protects a concrete failure you can name: a wrong proof accepted, emitted
TypeScript and Lean disagreeing, stale artifacts passing, a validation hole. Prefer one behavior
test at the owning boundary over many variants. `tests/emitters.test.ts` and
`tests/verify-check.test.ts` need Lean.

## Shipping

Push to `main` after `bun run c` passes. Releases are manual: `bun run release:patch`, or
`bun run release:minor` for breaking changes while Bip is 0.x.
