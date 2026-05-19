# Bip

Bip is an experimental proof-carrying TypeScript package tool.

The first MVP extracts `//@` contracts from exported TypeScript functions, emits a small Lean proof artifact for supported proof models, and writes a proof manifest that can travel with a package.

## Commands

```sh
bun install
bun run verify:example
bun run typecheck
```

Lean is optional for the scaffold. If `lean` is available on `PATH`, `bip verify` will run it against generated proof files. If not, the manifest records the check as skipped.
