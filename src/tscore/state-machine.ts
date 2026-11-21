import type { TSCoreStateMachine } from "./types.ts";

// Semantics shared by validation and both emitters: a declared transition moves the state, and
// every undeclared (state, action) pair leaves it unchanged.

export function guardName(machine: TSCoreStateMachine): string {
  return `can${machine.name.slice(0, 1).toUpperCase()}${machine.name.slice(1)}`;
}

// Lean-only helper that folds a list of actions through the reducer.
export function runName(machine: TSCoreStateMachine): string {
  return `${machine.name}Run`;
}

export function step(machine: TSCoreStateMachine, state: string, action: string): string {
  return machine.transitions.find((transition) => transition.from === state && transition.action === action)?.to ?? state;
}

// Every state reachable from `from`, each with a shortest action sequence that reaches it.
export function reachableFrom(machine: TSCoreStateMachine, from: string): Map<string, string[]> {
  const paths = new Map<string, string[]>([[from, []]]);
  const queue = [from];

  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    const path = paths.get(state) ?? [];

    for (const action of machine.actions) {
      const next = step(machine, state, action);

      if (!paths.has(next)) {
        paths.set(next, [...path, action]);
        queue.push(next);
      }
    }
  }

  return paths;
}
