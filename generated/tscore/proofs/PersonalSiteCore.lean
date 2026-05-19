import Init

namespace Bip.Generated.TSCore

/-! Generated from TSCore module 'PersonalSiteCore'. -/

inductive PageKind where
  | home
  | writing
  | project
  | admin
deriving Repr, BEq

inductive PublishPostResult where
  | success : Bool -> String -> String -> PublishPostResult
  | error : String -> PublishPostResult
deriving Repr, BEq

structure PageRoute where
  path : String
  label : String
deriving Repr, BEq

structure SitePage where
  kind : PageKind
  route : PageRoute
  title : String
  description : String
deriving Repr, BEq

structure PublishPostPayload where
  title : String
  slug : String
  summary : String
  content : String
deriving Repr, BEq

structure PublishPostSuccess where
  ok : Bool
  path : String
  url : String
deriving Repr, BEq

structure WritingManifestEntry where
  title : String
  path : String
  date : String
  summary : String
deriving Repr, BEq

structure WritingPostLookup where
  year : String
  slug : String
deriving Repr, BEq

structure SiteFooter where
  copyrightYear : String
  ownerName : String
deriving Repr, BEq

structure ContactLink where
  label : String
  href : String
  icon : String
deriving Repr, BEq

structure PrivatePageMetadata where
  title : String
  description : String
  robotsIndex : Bool
  robotsFollow : Bool
deriving Repr, BEq

structure HomeProfile where
  headline : String
  mission : String
  rolePrefix : String
  employerLabel : String
  employerHref : String
  roleSuffix : String
  contactLead : String
deriving Repr, BEq

def siteRoutes : List PageRoute :=
  [{ path := "/", label := "Home" }, { path := "/writing/", label := "Writing" }, { path := "/neill-industries", label := "Neill Industries" }]

theorem siteRoutes_nonempty :
    siteRoutes != [] := by
  decide

theorem siteRoutes_all_path_nonempty :
    siteRoutes.all (fun item => item.path != "") = true := by
  decide

theorem siteRoutes_all_label_nonempty :
    siteRoutes.all (fun item => item.label != "") = true := by
  decide

theorem siteRoutes_all_path_unique :
    (siteRoutes.map (fun item => item.path)).Nodup := by
  decide

theorem siteRoutes_all_path_starts_with :
    siteRoutes.all (fun item => "/".toList.isPrefixOf item.path.toList) = true := by
  decide

def siteMetadata : SitePage :=
  { kind := PageKind.home, route := { path := "/", label := "Home" }, title := "Rey Neill", description := "Software and hardware work by Rey Neill." }

theorem siteMetadata_title_eq :
    siteMetadata.title = "Rey Neill" := by
  rfl

def primaryNavigation : List PageRoute :=
  [{ path := "/writing/", label := "Writing" }, { path := "/neill-industries", label := "Neill Industries" }]

theorem primaryNavigation_nonempty :
    primaryNavigation != [] := by
  decide

theorem primaryNavigation_all_path_unique :
    (primaryNavigation.map (fun item => item.path)).Nodup := by
  decide

theorem primaryNavigation_all_path_starts_with :
    primaryNavigation.all (fun item => "/".toList.isPrefixOf item.path.toList) = true := by
  decide

theorem primaryNavigation_all_path_in_siteRoutes :
    primaryNavigation.all (fun item => siteRoutes.any (fun candidate => candidate.path == item.path)) = true := by
  decide

def writingPageMetadata : SitePage :=
  { kind := PageKind.writing, route := { path := "/writing/", label := "Writing" }, title := "Writing — Rey Neill", description := "Writing by Rey Neill." }

theorem writingPageMetadata_title_eq :
    writingPageMetadata.title = "Writing — Rey Neill" := by
  rfl

def neillIndustriesPageMetadata : SitePage :=
  { kind := PageKind.project, route := { path := "/neill-industries", label := "Neill Industries" }, title := "Neill Industries — Rey Neill", description := "Side projects, all of them on active on-demand development." }

theorem neillIndustriesPageMetadata_title_eq :
    neillIndustriesPageMetadata.title = "Neill Industries — Rey Neill" := by
  rfl

def adminPageMetadata : PrivatePageMetadata :=
  { title := "Admin — New Post", description := "", robotsIndex := false, robotsFollow := false }

theorem adminPageMetadata_title_eq :
    adminPageMetadata.title = "Admin — New Post" := by
  rfl

def dashboardPageMetadata : PrivatePageMetadata :=
  { title := "Dashboard", description := "", robotsIndex := false, robotsFollow := false }

theorem dashboardPageMetadata_title_eq :
    dashboardPageMetadata.title = "Dashboard" := by
  rfl

def signInPageMetadata : PrivatePageMetadata :=
  { title := "Sign In", description := "Sign in to Rey Neill admin.", robotsIndex := false, robotsFollow := false }

theorem signInPageMetadata_title_eq :
    signInPageMetadata.title = "Sign In" := by
  rfl

def homeProfile : HomeProfile :=
  { headline := "Rey Neill.", mission := "My life's meaning is dictated by importance, hence preserve consciousness and increase it's survival percentage. This is achieved by creating impactful software and hardware, technology that makes a difference, technology which mission is important. I'm constantly looking to participate on those places.", rolePrefix := "Currently looking for greater challenges, previously the third engineer at", employerLabel := "throxy (YC 25)", employerHref := "https://throxy.com", roleSuffix := "Tech Lead at Dechat and EM-1 at ClustAI", contactLead := "You can reach me at" }

theorem homeProfile_headline_eq :
    homeProfile.headline = "Rey Neill." := by
  rfl

def siteFooter : SiteFooter :=
  { copyrightYear := "2026", ownerName := "Rey Neill" }

theorem siteFooter_ownerName_eq :
    siteFooter.ownerName = "Rey Neill" := by
  rfl

def contactLinks : List ContactLink :=
  [{ label := "Send email", href := "mailto:contact@reyneill.com", icon := "mail" }, { label := "Follow on X", href := "https://x.com/reyneill_", icon := "/X (formerly Twitter)-dark.svg" }]

theorem contactLinks_nonempty :
    contactLinks != [] := by
  decide

theorem contactLinks_all_label_nonempty :
    contactLinks.all (fun item => item.label != "") = true := by
  decide

theorem contactLinks_all_href_nonempty :
    contactLinks.all (fun item => item.href != "") = true := by
  decide

theorem contactLinks_all_icon_nonempty :
    contactLinks.all (fun item => item.icon != "") = true := by
  decide

theorem contactLinks_all_label_unique :
    (contactLinks.map (fun item => item.label)).Nodup := by
  decide

theorem contactLinks_all_href_starts_with_one_of :
    contactLinks.all (fun item => ["mailto:", "https://"].any (fun p => p.toList.isPrefixOf item.href.toList)) = true := by
  decide

def pageTitle (page : SitePage) : String :=
  page.title

theorem pageTitle_returns_page_title (page : SitePage) :
    pageTitle page = page.title := by
  rfl

def pageDescription (page : SitePage) : String :=
  page.description

theorem pageDescription_returns_page_description (page : SitePage) :
    pageDescription page = page.description := by
  rfl

def pageRoute (page : SitePage) : PageRoute :=
  page.route

theorem pageRoute_returns_page_route (page : SitePage) :
    pageRoute page = page.route := by
  rfl

def privatePageTitle (page : PrivatePageMetadata) : String :=
  page.title

theorem privatePageTitle_returns_page_title (page : PrivatePageMetadata) :
    privatePageTitle page = page.title := by
  rfl

def privatePageDescription (page : PrivatePageMetadata) : String :=
  page.description

theorem privatePageDescription_returns_page_description (page : PrivatePageMetadata) :
    privatePageDescription page = page.description := by
  rfl

def privatePageRobotsIndex (page : PrivatePageMetadata) : Bool :=
  page.robotsIndex

theorem privatePageRobotsIndex_returns_page_robotsIndex (page : PrivatePageMetadata) :
    privatePageRobotsIndex page = page.robotsIndex := by
  rfl

def privatePageRobotsFollow (page : PrivatePageMetadata) : Bool :=
  page.robotsFollow

theorem privatePageRobotsFollow_returns_page_robotsFollow (page : PrivatePageMetadata) :
    privatePageRobotsFollow page = page.robotsFollow := by
  rfl

def homeProfileHeadline (profile : HomeProfile) : String :=
  profile.headline

theorem homeProfileHeadline_returns_profile_headline (profile : HomeProfile) :
    homeProfileHeadline profile = profile.headline := by
  rfl

def homeProfileMission (profile : HomeProfile) : String :=
  profile.mission

theorem homeProfileMission_returns_profile_mission (profile : HomeProfile) :
    homeProfileMission profile = profile.mission := by
  rfl

def homeProfileRolePrefix (profile : HomeProfile) : String :=
  profile.rolePrefix

theorem homeProfileRolePrefix_returns_profile_rolePrefix (profile : HomeProfile) :
    homeProfileRolePrefix profile = profile.rolePrefix := by
  rfl

def homeProfileEmployerLabel (profile : HomeProfile) : String :=
  profile.employerLabel

theorem homeProfileEmployerLabel_returns_profile_employerLabel (profile : HomeProfile) :
    homeProfileEmployerLabel profile = profile.employerLabel := by
  rfl

def homeProfileEmployerHref (profile : HomeProfile) : String :=
  profile.employerHref

theorem homeProfileEmployerHref_returns_profile_employerHref (profile : HomeProfile) :
    homeProfileEmployerHref profile = profile.employerHref := by
  rfl

def homeProfileRoleSuffix (profile : HomeProfile) : String :=
  profile.roleSuffix

theorem homeProfileRoleSuffix_returns_profile_roleSuffix (profile : HomeProfile) :
    homeProfileRoleSuffix profile = profile.roleSuffix := by
  rfl

def homeProfileContactLead (profile : HomeProfile) : String :=
  profile.contactLead

theorem homeProfileContactLead_returns_profile_contactLead (profile : HomeProfile) :
    homeProfileContactLead profile = profile.contactLead := by
  rfl

def routePath (route : PageRoute) : String :=
  route.path

theorem routePath_returns_route_path (route : PageRoute) :
    routePath route = route.path := by
  rfl

def routeLabel (route : PageRoute) : String :=
  route.label

theorem routeLabel_returns_route_label (route : PageRoute) :
    routeLabel route = route.label := by
  rfl

def footerCopyrightYear (footer : SiteFooter) : String :=
  footer.copyrightYear

theorem footerCopyrightYear_returns_footer_copyrightYear (footer : SiteFooter) :
    footerCopyrightYear footer = footer.copyrightYear := by
  rfl

def footerOwnerName (footer : SiteFooter) : String :=
  footer.ownerName

theorem footerOwnerName_returns_footer_ownerName (footer : SiteFooter) :
    footerOwnerName footer = footer.ownerName := by
  rfl

def contactLinkLabel (link : ContactLink) : String :=
  link.label

theorem contactLinkLabel_returns_link_label (link : ContactLink) :
    contactLinkLabel link = link.label := by
  rfl

def contactLinkHref (link : ContactLink) : String :=
  link.href

theorem contactLinkHref_returns_link_href (link : ContactLink) :
    contactLinkHref link = link.href := by
  rfl

def contactLinkIcon (link : ContactLink) : String :=
  link.icon

theorem contactLinkIcon_returns_link_icon (link : ContactLink) :
    contactLinkIcon link = link.icon := by
  rfl

def writingPublicPath (year : String) (datedSlug : String) : String :=
  ("writing/" ++ year ++ "/" ++ datedSlug ++ "/")

theorem writingPublicPath_returns_prefix (year : String) (datedSlug : String) :
    "writing/".toList.isPrefixOf (writingPublicPath year datedSlug).toList = true := by
  unfold writingPublicPath
  simp

theorem writingPublicPath_returns_suffix (year : String) (datedSlug : String) :
    ∃ p : String, writingPublicPath year datedSlug = p ++ "/" := by
  unfold writingPublicPath
  exact ⟨("writing/" ++ year ++ "/" ++ datedSlug), rfl⟩

def writingPublicFilePath (year : String) (datedSlug : String) : String :=
  ("web/public/writing/" ++ year ++ "/" ++ datedSlug ++ "/index.html")

theorem writingPublicFilePath_returns_prefix (year : String) (datedSlug : String) :
    "web/public/writing/".toList.isPrefixOf (writingPublicFilePath year datedSlug).toList = true := by
  unfold writingPublicFilePath
  simp

theorem writingPublicFilePath_returns_suffix (year : String) (datedSlug : String) :
    ∃ p : String, writingPublicFilePath year datedSlug = p ++ "/index.html" := by
  unfold writingPublicFilePath
  exact ⟨("web/public/writing/" ++ year ++ "/" ++ datedSlug), rfl⟩

def writingPublicIndexHref (year : String) (datedSlug : String) : String :=
  ("/writing/" ++ year ++ "/" ++ datedSlug ++ "/index.html")

theorem writingPublicIndexHref_returns_prefix (year : String) (datedSlug : String) :
    "/".toList.isPrefixOf (writingPublicIndexHref year datedSlug).toList = true := by
  unfold writingPublicIndexHref
  simp

theorem writingPublicIndexHref_returns_suffix (year : String) (datedSlug : String) :
    ∃ p : String, writingPublicIndexHref year datedSlug = p ++ "/index.html" := by
  unfold writingPublicIndexHref
  exact ⟨("/writing/" ++ year ++ "/" ++ datedSlug), rfl⟩

def publishedWritingTitle (title : String) : String :=
  (title ++ " — Rey Neill")

theorem publishedWritingTitle_returns_suffix (title : String) :
    ∃ p : String, publishedWritingTitle title = p ++ " — Rey Neill" := by
  unfold publishedWritingTitle
  exact ⟨(title), rfl⟩

def publishedWritingByline (name : String) : String :=
  ("— " ++ name)

theorem publishedWritingByline_returns_prefix (name : String) :
    "— ".toList.isPrefixOf (publishedWritingByline name).toList = true := by
  unfold publishedWritingByline
  simp

def publishPostSuccess (ok : Bool) (path : String) (url : String) : PublishPostSuccess :=
  { ok := ok, path := path, url := url }

theorem publishPostSuccess_returns_record (ok : Bool) (path : String) (url : String) :
    publishPostSuccess ok path url = { ok := ok, path := path, url := url } := by
  rfl

theorem publishPostSuccess_ok_eq (ok : Bool) (path : String) (url : String) :
    (publishPostSuccess ok path url).ok = ok := by
  rfl

theorem publishPostSuccess_path_eq (ok : Bool) (path : String) (url : String) :
    (publishPostSuccess ok path url).path = path := by
  rfl

theorem publishPostSuccess_url_eq (ok : Bool) (path : String) (url : String) :
    (publishPostSuccess ok path url).url = url := by
  rfl

def writingManifestEntry (title : String) (path : String) (date : String) (summary : String) : WritingManifestEntry :=
  { title := title, path := path, date := date, summary := summary }

theorem writingManifestEntry_returns_record (title : String) (path : String) (date : String) (summary : String) :
    writingManifestEntry title path date summary = { title := title, path := path, date := date, summary := summary } := by
  rfl

theorem writingManifestEntry_title_eq (title : String) (path : String) (date : String) (summary : String) :
    (writingManifestEntry title path date summary).title = title := by
  rfl

theorem writingManifestEntry_path_eq (title : String) (path : String) (date : String) (summary : String) :
    (writingManifestEntry title path date summary).path = path := by
  rfl

theorem writingManifestEntry_date_eq (title : String) (path : String) (date : String) (summary : String) :
    (writingManifestEntry title path date summary).date = date := by
  rfl

theorem writingManifestEntry_summary_eq (title : String) (path : String) (date : String) (summary : String) :
    (writingManifestEntry title path date summary).summary = summary := by
  rfl

def writingManifestEntryTitle (entry : WritingManifestEntry) : String :=
  entry.title

theorem writingManifestEntryTitle_returns_entry_title (entry : WritingManifestEntry) :
    writingManifestEntryTitle entry = entry.title := by
  rfl

def writingManifestEntryPath (entry : WritingManifestEntry) : String :=
  entry.path

theorem writingManifestEntryPath_returns_entry_path (entry : WritingManifestEntry) :
    writingManifestEntryPath entry = entry.path := by
  rfl

def writingManifestEntryDate (entry : WritingManifestEntry) : String :=
  entry.date

theorem writingManifestEntryDate_returns_entry_date (entry : WritingManifestEntry) :
    writingManifestEntryDate entry = entry.date := by
  rfl

def writingManifestEntrySummary (entry : WritingManifestEntry) : String :=
  entry.summary

theorem writingManifestEntrySummary_returns_entry_summary (entry : WritingManifestEntry) :
    writingManifestEntrySummary entry = entry.summary := by
  rfl

def writingPostLookup (year : String) (slug : String) : WritingPostLookup :=
  { year := year, slug := slug }

theorem writingPostLookup_returns_record (year : String) (slug : String) :
    writingPostLookup year slug = { year := year, slug := slug } := by
  rfl

theorem writingPostLookup_year_eq (year : String) (slug : String) :
    (writingPostLookup year slug).year = year := by
  rfl

theorem writingPostLookup_slug_eq (year : String) (slug : String) :
    (writingPostLookup year slug).slug = slug := by
  rfl

def writingPostLookupYear (lookup : WritingPostLookup) : String :=
  lookup.year

theorem writingPostLookupYear_returns_lookup_year (lookup : WritingPostLookup) :
    writingPostLookupYear lookup = lookup.year := by
  rfl

def writingPostLookupSlug (lookup : WritingPostLookup) : String :=
  lookup.slug

theorem writingPostLookupSlug_returns_lookup_slug (lookup : WritingPostLookup) :
    writingPostLookupSlug lookup = lookup.slug := by
  rfl

def isWritingPostLookup (lookup : WritingPostLookup) : Bool :=
  (!(lookup.year == "") && !(lookup.slug == ""))

theorem isWritingPostLookup_year_empty_is_false (slug : String) :
    isWritingPostLookup { year := "", slug := slug } = false := by
  unfold isWritingPostLookup
  simp

theorem isWritingPostLookup_slug_empty_is_false (year : String) :
    isWritingPostLookup { year := year, slug := "" } = false := by
  unfold isWritingPostLookup
  simp

def publishSuccessResult (result : PublishPostSuccess) : PublishPostResult :=
  (PublishPostResult.success result.ok result.path result.url)

theorem publishSuccessResult_returns_success (result : PublishPostSuccess) :
    publishSuccessResult result = (PublishPostResult.success result.ok result.path result.url) := by
  rfl

def isPublishablePayload (payload : PublishPostPayload) : Bool :=
  (!(payload.title == "") && !(payload.slug == ""))

theorem isPublishablePayload_title_empty_is_false (slug : String) (summary : String) (content : String) :
    isPublishablePayload { title := "", slug := slug, summary := summary, content := content } = false := by
  unfold isPublishablePayload
  simp

theorem isPublishablePayload_slug_empty_is_false (title : String) (summary : String) (content : String) :
    isPublishablePayload { title := title, slug := "", summary := summary, content := content } = false := by
  unfold isPublishablePayload
  simp

def publishErrorResult (message : String) : PublishPostResult :=
  (PublishPostResult.error message)

theorem publishErrorResult_returns_error (message : String) :
    publishErrorResult message = (PublishPostResult.error message) := by
  rfl

def isPublishSuccess (result : PublishPostResult) : Bool :=
  (match result with
  | PublishPostResult.success _ _ _ => true
  | PublishPostResult.error _ => false)

theorem isPublishSuccess_success_is_success (ok : Bool) (path : String) (url : String) :
    isPublishSuccess (PublishPostResult.success ok path url) = true := by
  rfl

theorem isPublishSuccess_error_is_not_success (message : String) :
    isPublishSuccess (PublishPostResult.error message) = false := by
  rfl

def isPublishError (result : PublishPostResult) : Bool :=
  (match result with
  | PublishPostResult.success _ _ _ => false
  | PublishPostResult.error _ => true)

theorem isPublishError_success_is_not_error (ok : Bool) (path : String) (url : String) :
    isPublishError (PublishPostResult.success ok path url) = false := by
  rfl

theorem isPublishError_error_is_error (message : String) :
    isPublishError (PublishPostResult.error message) = true := by
  rfl

inductive PublishState where
  | draft
  | scheduled
  | published
  | archived
deriving Repr, BEq

inductive PublishAction where
  | schedule
  | publish
  | archive
  | edit
deriving Repr, BEq

def publishTransition : PublishState -> PublishAction -> PublishState
  | .draft, .schedule => .scheduled
  | .draft, .publish => .published
  | .draft, .archive => .archived
  | .scheduled, .publish => .published
  | .scheduled, .archive => .archived
  | .published, .publish => .published
  | .published, .archive => .archived
  | state, _ => state

def canPublishTransition : PublishState -> PublishAction -> Bool
  | .draft, .schedule => true
  | .draft, .publish => true
  | .draft, .archive => true
  | .scheduled, .publish => true
  | .scheduled, .archive => true
  | .published, .publish => true
  | .published, .archive => true
  | _, _ => false

theorem publishTransition_draft_schedule_to_scheduled :
    publishTransition .draft .schedule = .scheduled := by
  rfl

theorem publishTransition_draft_publish_to_published :
    publishTransition .draft .publish = .published := by
  rfl

theorem publishTransition_draft_archive_to_archived :
    publishTransition .draft .archive = .archived := by
  rfl

theorem publishTransition_scheduled_publish_to_published :
    publishTransition .scheduled .publish = .published := by
  rfl

theorem publishTransition_scheduled_archive_to_archived :
    publishTransition .scheduled .archive = .archived := by
  rfl

theorem publishTransition_published_publish_to_published :
    publishTransition .published .publish = .published := by
  rfl

theorem publishTransition_published_archive_to_archived :
    publishTransition .published .archive = .archived := by
  rfl

theorem publishTransition_draft_edit_stays_draft :
    publishTransition .draft .edit = .draft := by
  rfl

theorem publishTransition_scheduled_schedule_stays_scheduled :
    publishTransition .scheduled .schedule = .scheduled := by
  rfl

theorem publishTransition_scheduled_edit_stays_scheduled :
    publishTransition .scheduled .edit = .scheduled := by
  rfl

theorem publishTransition_published_schedule_stays_published :
    publishTransition .published .schedule = .published := by
  rfl

theorem publishTransition_published_edit_stays_published :
    publishTransition .published .edit = .published := by
  rfl

theorem publishTransition_archived_schedule_stays_archived :
    publishTransition .archived .schedule = .archived := by
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

theorem canPublishTransition_draft_schedule_is_allowed :
    canPublishTransition .draft .schedule = true := by
  rfl

theorem canPublishTransition_draft_publish_is_allowed :
    canPublishTransition .draft .publish = true := by
  rfl

theorem canPublishTransition_draft_archive_is_allowed :
    canPublishTransition .draft .archive = true := by
  rfl

theorem canPublishTransition_scheduled_publish_is_allowed :
    canPublishTransition .scheduled .publish = true := by
  rfl

theorem canPublishTransition_scheduled_archive_is_allowed :
    canPublishTransition .scheduled .archive = true := by
  rfl

theorem canPublishTransition_published_publish_is_allowed :
    canPublishTransition .published .publish = true := by
  rfl

theorem canPublishTransition_published_archive_is_allowed :
    canPublishTransition .published .archive = true := by
  rfl

theorem canPublishTransition_draft_edit_is_blocked :
    canPublishTransition .draft .edit = false := by
  rfl

theorem canPublishTransition_scheduled_schedule_is_blocked :
    canPublishTransition .scheduled .schedule = false := by
  rfl

theorem canPublishTransition_scheduled_edit_is_blocked :
    canPublishTransition .scheduled .edit = false := by
  rfl

theorem canPublishTransition_published_schedule_is_blocked :
    canPublishTransition .published .schedule = false := by
  rfl

theorem canPublishTransition_published_edit_is_blocked :
    canPublishTransition .published .edit = false := by
  rfl

theorem canPublishTransition_archived_schedule_is_blocked :
    canPublishTransition .archived .schedule = false := by
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
