export type CounterState = {
  count: number;
};

//@ bip:model CounterNatReducer
//@ requires state.count >= 0
//@ ensures result.count >= 0
export function decrement(state: CounterState): CounterState {
  if (state.count === 0) {
    return { count: 0 };
  }

  return { count: state.count - 1 };
}
