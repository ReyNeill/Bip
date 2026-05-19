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

def routePath (route : PageRoute) : String :=
  route.path

theorem routePath_returns_route_path (route : PageRoute) :
    routePath route = route.path := by
  rfl

inductive PublishState where
  | draft
  | published
  | archived
deriving Repr, BEq

inductive PublishAction where
  | publish
  | archive
  | edit
deriving Repr, BEq

def publishTransition : PublishState -> PublishAction -> PublishState
  | .draft, .publish => .published
  | .published, .archive => .archived
  | state, _ => state

def canPublishTransition : PublishState -> PublishAction -> Bool
  | .draft, .publish => true
  | .published, .archive => true
  | _, _ => false

theorem publishTransition_draft_publish_to_published :
    publishTransition .draft .publish = .published := by
  rfl

theorem publishTransition_published_archive_to_archived :
    publishTransition .published .archive = .archived := by
  rfl

theorem publishTransition_draft_archive_stays_draft :
    publishTransition .draft .archive = .draft := by
  rfl

theorem publishTransition_draft_edit_stays_draft :
    publishTransition .draft .edit = .draft := by
  rfl

theorem publishTransition_published_publish_stays_published :
    publishTransition .published .publish = .published := by
  rfl

theorem publishTransition_published_edit_stays_published :
    publishTransition .published .edit = .published := by
  rfl

theorem publishTransition_archived_publish_stays_archived :
    publishTransition .archived .publish = .archived := by
  rfl

theorem publishTransition_archived_archive_stays_archived :
    publishTransition .archived .archive = .archived := by
  rfl

theorem publishTransition_archived_edit_stays_archived :
    publishTransition .archived .edit = .archived := by
  rfl

theorem publishTransition_archived_terminal (action : PublishAction) :
    publishTransition .archived action = .archived := by
  cases action <;> rfl

theorem canPublishTransition_draft_publish_is_allowed :
    canPublishTransition .draft .publish = true := by
  rfl

theorem canPublishTransition_published_archive_is_allowed :
    canPublishTransition .published .archive = true := by
  rfl

theorem canPublishTransition_draft_archive_is_blocked :
    canPublishTransition .draft .archive = false := by
  rfl

theorem canPublishTransition_draft_edit_is_blocked :
    canPublishTransition .draft .edit = false := by
  rfl

theorem canPublishTransition_published_publish_is_blocked :
    canPublishTransition .published .publish = false := by
  rfl

theorem canPublishTransition_published_edit_is_blocked :
    canPublishTransition .published .edit = false := by
  rfl

theorem canPublishTransition_archived_publish_is_blocked :
    canPublishTransition .archived .publish = false := by
  rfl

theorem canPublishTransition_archived_archive_is_blocked :
    canPublishTransition .archived .archive = false := by
  rfl

theorem canPublishTransition_archived_edit_is_blocked :
    canPublishTransition .archived .edit = false := by
  rfl

end Bip.Generated.TSCore
