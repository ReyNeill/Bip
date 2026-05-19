# Bip: proof-carrying TypeScript packages

On May 18, 2026, Vitalik published [A shallow dive into formal verification](https://vitalik.eth.limo/general/2026/05/18/fv.html). I read it the same afternoon and posted:

> There are many people trying to find the verifiable coding language for AI, myself included.

Bip is what I've been building toward that idea. This is the short version of where it came from, what I learned along the way, and what's actually in the repo today.

## What inspired me

Vitalik's piece argues that AI lowers the cost of generating code *and* the cost of finding bugs, and that formal verification is the natural partner for AI-written software. The point that stuck with me was the framing of a "secure core": you don't verify everything, you verify the small surface that matters and let the rest stay fast and messy.

I had been circling the same question from the other side. If agents are going to write most of the software, what is the artifact a human actually reviews? Reading every diff doesn't scale. Reading tests doesn't scale either, since tests are just more code. What scales is a specification plus a machine-checked proof that the code matches it.

So the thing I want to ship is not a smarter linter or a stricter type system. It's a package format where the claims are explicit and someone else's machine can re-check them.

## What I learned

The main lesson is that a prover doesn't prove "the code is correct." It proves

$$
\text{program} \models \text{spec}
$$

which means the spec is now the load-bearing artifact. If the spec is sloppy, the proof is worthless. If the spec is sharp, the proof is the most valuable thing in the repository.

A few smaller things fell out of that:

- The verified unit should be the package boundary — exported functions, reducers, schemas, route contracts — not "all of TypeScript."
- JavaScript has too many sharp edges (`NaN`, mutation, `undefined`, async, coercions) to model honestly on day one. The honest move is to verify a restricted core and treat the rest as externals with runtime checks.
- Proof code is where agents earn their keep. Humans should read the *statement* being proved; the proof script itself is the kind of repetitive work LLMs are already good at.

## What I built

Bip extracts `//@ requires` / `//@ ensures` contracts from exported TypeScript, emits Lean proof artifacts, runs `lean` against them when it's on the PATH, and writes a manifest the package can ship with.

The current manifest for the counter example looks like this:

```json
{
  "checker": "lean4",
  "verifiedExports": [
    {
      "exportName": "decrement",
      "model": "CounterNatReducer",
      "requires": ["state.count >= 0"],
      "ensures": ["result.count >= 0"],
      "theoremNames": ["Bip.Generated.decrement_preserves_nonnegative"],
      "status": "checked"
    }
  ]
}
```

It's a toy, but the loop is end-to-end: TypeScript contract → Lean theorem → `lean` checks it → manifest records the result.

On top of that I started a second layer called `TSCore`: a small IR that emits both runtime TypeScript and Lean definitions from the same source object. Instead of trying to translate arbitrary TS into Lean, agents author the TSCore model and Bip generates the two sides. The pipeline:

```text
TSCore model
  ├── Lean definitions + theorem obligations  →  lean check
  └── TypeScript / TSX output                 →  Bun, React, npm
```

The first non-toy target is a React/Bun-style app that imports generated metadata, navigation, a writing index, and a project catalog from TSCore sources. The reducers feeding React are exactly the kind of thing worth proving — many frontend bugs are state-machine bugs, not DOM bugs.

The invariant Bip is trying to maintain for a published package is just:

$$
\forall e \in \text{verifiedExports},\quad \text{LeanCheck}(e.\text{proof}) = \text{true}
$$

If that holds, you don't have to trust my README. You re-run the checker.

## Challenges

**Picking what to model.** TSCore has to be expressive enough to be useful and narrow enough to translate to Lean cleanly. I kept wanting to add features (closures, async, classes) and kept ripping them back out. The first version is pure functions, records, discriminated unions, integers, arrays, options/results, and reducer-style state machines.

**Trust boundaries.** React, Bun, the browser, npm, the network — none of these are verifiable from inside Bip. They have to live as externals with assumptions written down. Deciding what to declare as "trust me" vs. what to actually prove is most of the design work.

**Lean ergonomics.** Even simple obligations like "decrement preserves non-negativity on `Nat`" require getting the right tactics in the right order. The generator currently emits straightforward proofs for a handful of templates; anything beyond that I'd want an agent driving Lean directly rather than me hand-rolling tactic strings.

**Resisting the urge to build a cathedral.** A full verified TypeScript semantics would be a great PhD. It is not a first product. The first product is one package, one contract, one checked proof, one manifest — which is what's in the repo now.

## Where this goes

The bet is that as more code gets written by agents, the thing humans review shifts from source files to specifications, and the thing packages ship shifts from "trust me, it has tests" to "here is the manifest, re-check it yourself."

Bip is small and early. But the loop works, the manifest is real, and the next useful step is making the consumer-project flow smooth enough for ordinary apps.

## Sources

- Vitalik Buterin, [A shallow dive into formal verification](https://vitalik.eth.limo/general/2026/05/18/fv.html)
- Vitalik's [post](https://x.com/VitalikButerin/status/2056354141832626487), May 18, 2026
- This repo: `README.md` and `generated/proof-manifest.json`
