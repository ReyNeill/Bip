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

def scanCategoryName (category : ScanCategory) : String :=
  category.name

theorem scanCategoryName_returns_category_name (category : ScanCategory) :
    scanCategoryName category = category.name := by
  rfl

def leanCheckChecked (detail : String) : LeanCheckResult :=
  (LeanCheckResult.checked detail)

theorem leanCheckChecked_returns_checked (detail : String) :
    leanCheckChecked detail = (LeanCheckResult.checked detail) := by
  rfl

def leanCheckSkipped (detail : String) : LeanCheckResult :=
  (LeanCheckResult.skipped detail)

theorem leanCheckSkipped_returns_skipped (detail : String) :
    leanCheckSkipped detail = (LeanCheckResult.skipped detail) := by
  rfl

def leanCheckFailed (detail : String) : LeanCheckResult :=
  (LeanCheckResult.failed detail)

theorem leanCheckFailed_returns_failed (detail : String) :
    leanCheckFailed detail = (LeanCheckResult.failed detail) := by
  rfl

def isLeanCheckChecked (result : LeanCheckResult) : Bool :=
  (match result with
  | LeanCheckResult.checked _ => true
  | LeanCheckResult.skipped _ => false
  | LeanCheckResult.failed _ => false)

theorem isLeanCheckChecked_checked_is_checked (detail : String) :
    isLeanCheckChecked (LeanCheckResult.checked detail) = true := by
  rfl

theorem isLeanCheckChecked_skipped_is_not_checked (detail : String) :
    isLeanCheckChecked (LeanCheckResult.skipped detail) = false := by
  rfl

theorem isLeanCheckChecked_failed_is_not_checked (detail : String) :
    isLeanCheckChecked (LeanCheckResult.failed detail) = false := by
  rfl

inductive ScanGateStatus where
  | clean
  | warn
  | error
deriving Repr, BEq

inductive ScanFindingSignal where
  | observeInfo
  | observeWarn
  | observeError
deriving Repr, BEq

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

theorem scanGateStatusTransition_clean_observeWarn_to_warn :
    scanGateStatusTransition .clean .observeWarn = .warn := by
  rfl

theorem scanGateStatusTransition_clean_observeError_to_error :
    scanGateStatusTransition .clean .observeError = .error := by
  rfl

theorem scanGateStatusTransition_warn_observeError_to_error :
    scanGateStatusTransition .warn .observeError = .error := by
  rfl

theorem scanGateStatusTransition_clean_observeInfo_stays_clean :
    scanGateStatusTransition .clean .observeInfo = .clean := by
  rfl

theorem scanGateStatusTransition_warn_observeInfo_stays_warn :
    scanGateStatusTransition .warn .observeInfo = .warn := by
  rfl

theorem scanGateStatusTransition_warn_observeWarn_stays_warn :
    scanGateStatusTransition .warn .observeWarn = .warn := by
  rfl

theorem scanGateStatusTransition_error_observeInfo_stays_error :
    scanGateStatusTransition .error .observeInfo = .error := by
  rfl

theorem scanGateStatusTransition_error_observeWarn_stays_error :
    scanGateStatusTransition .error .observeWarn = .error := by
  rfl

theorem scanGateStatusTransition_error_observeError_stays_error :
    scanGateStatusTransition .error .observeError = .error := by
  rfl

theorem scanGateStatusTransition_error_terminal (action : ScanFindingSignal) :
    scanGateStatusTransition .error action = .error := by
  cases action <;> rfl

theorem canScanGateStatusTransition_clean_observeWarn_is_allowed :
    canScanGateStatusTransition .clean .observeWarn = true := by
  rfl

theorem canScanGateStatusTransition_clean_observeError_is_allowed :
    canScanGateStatusTransition .clean .observeError = true := by
  rfl

theorem canScanGateStatusTransition_warn_observeError_is_allowed :
    canScanGateStatusTransition .warn .observeError = true := by
  rfl

theorem canScanGateStatusTransition_clean_observeInfo_is_blocked :
    canScanGateStatusTransition .clean .observeInfo = false := by
  rfl

theorem canScanGateStatusTransition_warn_observeInfo_is_blocked :
    canScanGateStatusTransition .warn .observeInfo = false := by
  rfl

theorem canScanGateStatusTransition_warn_observeWarn_is_blocked :
    canScanGateStatusTransition .warn .observeWarn = false := by
  rfl

theorem canScanGateStatusTransition_error_observeInfo_is_blocked :
    canScanGateStatusTransition .error .observeInfo = false := by
  rfl

theorem canScanGateStatusTransition_error_observeWarn_is_blocked :
    canScanGateStatusTransition .error .observeWarn = false := by
  rfl

theorem canScanGateStatusTransition_error_observeError_is_blocked :
    canScanGateStatusTransition .error .observeError = false := by
  rfl

end Bip.Generated.TSCore
