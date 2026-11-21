import Init

namespace Bip.Generated.TSCore

/-! Generated from TSCore module 'ScanScoring'. -/

inductive LeanCheckResult where
  | checked : String -> LeanCheckResult
  | skipped : String -> LeanCheckResult
  | failed : String -> LeanCheckResult
deriving Repr, BEq

structure ScanCategory where
  name : String
deriving Repr, BEq

def builtInScanCategories : List ScanCategory :=
  [{ name := "Project Checks" }, { name := "Discovered Boundaries" }]

theorem builtInScanCategories_nonempty :
    builtInScanCategories != [] := by
  decide

theorem builtInScanCategories_all_name_nonempty :
    builtInScanCategories.all (fun item => item.name != "") = true := by
  decide

theorem builtInScanCategories_all_name_unique :
    (builtInScanCategories.map (fun item => item.name)).Nodup := by
  decide

inductive ScanGateStatus where
  | clean
  | warn
  | error
deriving Repr, DecidableEq

inductive ScanFindingSignal where
  | observeInfo
  | observeWarn
  | observeError
deriving Repr, DecidableEq

def scanGateStatusTransition : ScanGateStatus -> ScanFindingSignal -> ScanGateStatus
  | .clean, .observeWarn => .warn
  | .clean, .observeError => .error
  | .warn, .observeError => .error
  | state, _ => state

def canScanGateStatusTransition : ScanGateStatus -> ScanFindingSignal -> Bool
  | .clean, .observeWarn => true
  | .clean, .observeError => true
  | .warn, .observeError => true
  | _, _ => false

def scanGateStatusTransitionRun : ScanGateStatus -> List ScanFindingSignal -> ScanGateStatus
  | state, [] => state
  | state, action :: rest => scanGateStatusTransitionRun (scanGateStatusTransition state action) rest

theorem scanGateStatusTransition_blocked_keeps_state (state : ScanGateStatus) (action : ScanFindingSignal) :
    canScanGateStatusTransition state action = false -> scanGateStatusTransition state action = state := by
  cases state <;> cases action <;> decide

theorem scanGateStatusTransition_error_terminal (action : ScanFindingSignal) :
    scanGateStatusTransition .error action = .error := by
  cases action <;> rfl

theorem scanGateStatusTransition_warn_reachable :
    ∃ actions : List ScanFindingSignal, scanGateStatusTransitionRun .clean actions = .warn := by
  exact ⟨[.observeWarn], by decide⟩

theorem scanGateStatusTransition_error_reachable :
    ∃ actions : List ScanFindingSignal, scanGateStatusTransitionRun .clean actions = .error := by
  exact ⟨[.observeError], by decide⟩

theorem scanGateStatusTransition_warn_never_reaches_clean (actions : List ScanFindingSignal) :
    scanGateStatusTransitionRun .warn actions ≠ .clean := by
  let inside : ScanGateStatus -> Bool := (fun state : ScanGateStatus => match state with
      | .warn => true
      | .error => true
      | _ => false)
  have closed : ∀ (state : ScanGateStatus) (action : ScanFindingSignal), inside state = true -> inside (scanGateStatusTransition state action) = true := by
    intro state action
    cases state <;> cases action <;> decide
  have stays : ∀ (rest : List ScanFindingSignal) (state : ScanGateStatus), inside state = true -> inside (scanGateStatusTransitionRun state rest) = true := by
    intro rest
    induction rest with
    | nil => intro state h; exact h
    | cons action rest ih => intro state h; exact ih (scanGateStatusTransition state action) (closed state action h)
  intro reached
  have h := stays actions .warn (by decide)
  rw [reached] at h
  exact absurd h (by decide)

end Bip.Generated.TSCore
