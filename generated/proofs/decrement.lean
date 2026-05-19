import Init

namespace Bip.Generated

/-!
Generated from examples/counter.ts.

This MVP intentionally models counter state as Nat in Lean. The TypeScript runtime
still uses JavaScript numbers; runtime Nat validation is a later boundary check.
-/

structure CounterState where
  count : Nat
deriving Repr, BEq

def decrement (state : CounterState) : CounterState :=
  if state.count == 0 then
    { count := 0 }
  else
    { count := state.count - 1 }

theorem decrement_preserves_nonnegative (state : CounterState) :
    (decrement state).count >= 0 := by
  exact Nat.zero_le _

end Bip.Generated
