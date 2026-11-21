import Init

namespace Bip.Generated.TSCore

/-! Generated from TSCore module 'BasicSiteCore'. -/

structure PageRoute where
  path : String
  label : String
deriving Repr, BEq

def siteRoutes : List PageRoute :=
  [{ path := "/", label := "Home" }]

theorem siteRoutes_nonempty :
    siteRoutes != [] := by
  decide

theorem siteRoutes_all_path_unique :
    (siteRoutes.map (fun item => item.path)).Nodup := by
  decide

theorem siteRoutes_all_path_starts_with :
    siteRoutes.all (fun item => "/".toList.isPrefixOf item.path.toList) = true := by
  decide

def writingHref (slug : String) : String :=
  ("/writing/" ++ slug)

theorem writingHref_returns_prefix (slug : String) :
    "/writing/".toList.isPrefixOf (writingHref slug).toList = true := by
  unfold writingHref
  simp

inductive PublishState where
  | draft
  | published
  | archived
deriving Repr, DecidableEq

inductive PublishAction where
  | publish
  | archive
  | edit
deriving Repr, DecidableEq

def publishTransition : PublishState -> PublishAction -> PublishState
  | .draft, .publish => .published
  | .published, .archive => .archived
  | state, _ => state

def canPublishTransition : PublishState -> PublishAction -> Bool
  | .draft, .publish => true
  | .published, .archive => true
  | _, _ => false

def publishTransitionRun : PublishState -> List PublishAction -> PublishState
  | state, [] => state
  | state, action :: rest => publishTransitionRun (publishTransition state action) rest

theorem publishTransition_blocked_keeps_state (state : PublishState) (action : PublishAction) :
    canPublishTransition state action = false -> publishTransition state action = state := by
  cases state <;> cases action <;> decide

theorem publishTransition_archived_terminal (action : PublishAction) :
    publishTransition .archived action = .archived := by
  cases action <;> rfl

theorem publishTransition_published_reachable :
    ∃ actions : List PublishAction, publishTransitionRun .draft actions = .published := by
  exact ⟨[.publish], by decide⟩

theorem publishTransition_archived_reachable :
    ∃ actions : List PublishAction, publishTransitionRun .draft actions = .archived := by
  exact ⟨[.publish, .archive], by decide⟩

theorem publishTransition_published_never_reaches_draft (actions : List PublishAction) :
    publishTransitionRun .published actions ≠ .draft := by
  let inside : PublishState -> Bool := (fun state : PublishState => match state with
      | .published => true
      | .archived => true
      | _ => false)
  have closed : ∀ (state : PublishState) (action : PublishAction), inside state = true -> inside (publishTransition state action) = true := by
    intro state action
    cases state <;> cases action <;> decide
  have stays : ∀ (rest : List PublishAction) (state : PublishState), inside state = true -> inside (publishTransitionRun state rest) = true := by
    intro rest
    induction rest with
    | nil => intro state h; exact h
    | cons action rest ih => intro state h; exact ih (publishTransition state action) (closed state action h)
  intro reached
  have h := stays actions .published (by decide)
  rw [reached] at h
  exact absurd h (by decide)

end Bip.Generated.TSCore
