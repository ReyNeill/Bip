# Bip

Bip is an experimental proof-carrying TypeScript package tool.

The first MVP extracts `//@` contracts from exported TypeScript functions, emits a small Lean proof artifact for supported proof models, and writes a proof manifest that can travel with a package.

## Commands

```sh
bun install
bun run src/cli.ts init [directory]
bun run verify:self
bun run verify:example
bun run verify:core
bun run scan:self
bun run typecheck
```

Lean is optional for the scaffold. If `lean` is available on `PATH`, `bip verify` will run it against generated proof files. If not, the manifest records the check as skipped.

## Release

Patch releases are manual:

```sh
bun run release:patch
```

The release script requires a clean git worktree, runs the local checks, bumps the package patch version, commits the version bump, packs the package, and publishes it publicly. Pass npm publish flags after the script when needed, for example `bun run release:patch --otp 123456`.

## Project Config

Projects use Bip without modifying the Bip repo by adding a project-owned `bip.config.ts`:

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

`bip verify` loads the config, generates runtime TypeScript and Lean artifacts for each module, runs Lean, and writes proof manifests.

`bip scan` is the adoption scanner. It detects the project context, checks configured proof modules and project gates, then prints a React-Doctor-style score with categorized diagnostics.

`bip init` creates a starter `bip.config.ts`, `bip/example.tscore.ts`, and a short `AGENTS.md` note.

For installation, config, TSCore authoring, verification, scan output, and proof manifest details, see [Getting Started](docs/getting-started.md).

## Dogfooding

Bip uses the published package alias as its own consumer:

```sh
bun run verify:self
bun run scan:self
bun run scan:published
```

`verify:self` runs the installed `bip@npm:@reyneill/bip` package against this repo's `bip.config.ts`. `scan:self` checks the current source, while `scan:published` checks the currently installed published scanner. The first self-proof module backs scan scoring/category invariants and emits checked runtime helpers under `src/generated/bip`.

## TSCore

`bun run verify:core` demonstrates the next product layer: a tiny TSCore IR that emits both runtime TypeScript and Lean from the same source object. The generic example models route helpers and a publish-state reducer contract.

Bip is designed to be consumed by external projects without modifying this repo. A consumer owns its `bip.config.ts`, keeps TSCore modules in its own `bip/` directory, and writes generated artifacts to its own `src/generated/bip` directory.

Metadata and navigation rendering use generated field helpers such as `pageTitle`, `pageDescription`, `routePath`, and `routeLabel`, each tied to a Lean-checked `returnsField` theorem.

State machines emit theorem names for every declared transition, plus terminal-state theorems. That lets a consumer gate on concrete reducer facts such as `draft + publish -> published` instead of only checking that a proof file exists.

Missing state-machine transition pairs are treated as explicit self-transitions in the proof layer, matching the generated TypeScript reducer default branch. Duplicate `(state, action)` transitions are rejected by TSCore validation.

State machines also emit proof-backed action guards such as `canPublishTransition`. These return `true` only for declared transitions and generate Lean theorems for both allowed and blocked state/action pairs, so UI controls can be driven by the same checked state model as the reducer.

Tagged unions support payload variants in generated TypeScript and Lean. Pure functions can carry a `returnsVariant` contract, producing a named Lean theorem that the function constructs the expected variant.

Record constructor functions can carry a `recordConstructor` contract. Bip then proves the function returns the expected record and that each generated output field equals the same-named input parameter.

The publish API uses generated record constructors for both success responses and writing manifest entries, so response and catalog-update shapes are built through checked TSCore helpers instead of local object literals.

Record predicates can assert that selected string fields are non-empty. The generated TypeScript predicate is usable at runtime, and Bip emits Lean theorems showing that each required empty field makes the predicate return `false`.

Array-of-record constants can also assert field uniqueness. Consumer projects can use this for route paths, content catalog paths, and project names so duplicate catalog entries fail before the app builds.

String fields in array constants can assert prefixes. Consumer projects can use this to prove generated routes start with `/` and generated content paths use the expected public prefix.

Optional string fields can assert “empty or starts with prefix.” The project catalog uses this for optional logo paths and external URLs.

Pure functions can concatenate strings and carry a `returnsStartsWith` contract. The publish API uses generated helpers for public writing paths and repository file paths instead of hand-building those strings inline.

Generated string helpers can also carry `returnsEndsWith` contracts. Bip emits a Lean witness that the result is some prefix concatenated with the expected suffix.

The writing page uses a generated `postHref` helper with a `returnsStartsWith "/"` proof, so public links are produced by TSCore instead of local string normalization.

Writing post titles, dates, summaries, years, slugs, paths, and hrefs are exposed through generated field helpers, so public listing and editor search consume the checked TSCore surface instead of reading raw post fields directly.

The writing post reader uses `writingPublicIndexHref` for iframe URLs, with Lean-checked prefix and suffix contracts covering the `/writing/.../index.html` shape.

The project catalog exposes generated helpers for names, descriptions, logos, URLs, and linkability. Project cards consume those helpers so optional links and media are mediated by checked TSCore functions instead of direct field reads.

The publish API uses generated success and error constructors for its result union, so both response branches are tied to Lean-checked `returnsVariant` theorems.
The post lookup API now constructs and validates `year`/`slug` through generated TSCore helpers, so public writing request parameters are covered by Lean-checked record and non-empty predicate theorems.
Project-specific writing and catalog modules can be built through a project-owned source adapter under the consumer app's `bip/` directory. The adapter can read app-owned JSON or TypeScript data before emitting runtime TypeScript and Lean proofs.
The same pattern can derive `siteRoutes`, `siteMetadata`, and `primaryNavigation` from app-owned data, so top-level metadata and navigation stay project-owned while still getting generated runtime helpers and Lean-checked route contracts.
Footer ownership and contact links also come from `site-core.json`. TSCore now supports an `allItemsFieldStartsWithOneOf` constant contract, which Lean-checks mixed URL schemes such as `mailto:` and `https://` for generated contact metadata.
Named page metadata can also be derived from app-owned data, with generated `SitePage` constants and a `pageRoute` accessor so Next page metadata and headings can use the same Lean-checked model as navigation.
Private page metadata for Admin, Dashboard, and Sign In is derived from `site-core.json` as `PrivatePageMetadata`, with generated title, description, and robots helpers checked by Lean before the site build runs.
The homepage profile copy is now modeled as a `HomeProfile` record in TSCore. The homepage renders its headline, mission, role text, employer link, and contact lead through generated helpers, while the verifier stale-checks the generated runtime against `site-core.json`.
Writing post routes and loading states can consume generated page metadata as well, so fallback descriptions, back links, loading headings, and loading descriptions stay tied to the same checked `SitePage` model.
Published writing document titles can be produced by a generated `publishedWritingTitle` helper. A Lean theorem can prove the generated title ends with the configured site suffix, and the publish API can use that helper when creating HTML.
Published writing bylines are produced by a generated `publishedWritingByline` helper. Its Lean theorem proves the rendered byline starts with `— `, and the publish API uses that helper in generated post HTML.

Manifest upsert logic consumes generated `WritingManifestEntry` field helpers for identity, sort order, and commit messages, keeping that record boundary on the checked TSCore surface.

Generated union predicates can check whether a result has a specific variant tag. The editor uses `isPublishSuccess` and `isPublishError` to consume the proof-backed publish result union.
