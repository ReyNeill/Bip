import { readFileSync } from "node:fs";
import path from "node:path";
import { defineModule } from "../tscore/define.ts";
import type { TSCoreConstant, TSCoreExpr, TSCoreFunction, TSCoreModule } from "../tscore/types.ts";

export type RawWritingPost = {
  title?: unknown;
  path?: unknown;
  date?: unknown;
  summary?: unknown;
};

export type RawNeillProject = {
  name?: unknown;
  description?: unknown;
  logo?: unknown;
  url?: unknown;
};

export type RawSiteCore = {
  siteMetadata?: {
    kind?: unknown;
    routePath?: unknown;
    title?: unknown;
    description?: unknown;
  };
  routes?: unknown;
  primaryNavigationPaths?: unknown;
  pages?: unknown;
  privatePages?: unknown;
  homeProfile?: {
    headline?: unknown;
    mission?: unknown;
    rolePrefix?: unknown;
    employerLabel?: unknown;
    employerHref?: unknown;
    roleSuffix?: unknown;
    contactLead?: unknown;
  };
  footer?: {
    copyrightYear?: unknown;
    ownerName?: unknown;
  };
  contactLinks?: unknown;
};

export type RawSiteRoute = {
  path?: unknown;
  label?: unknown;
};

export type RawSitePage = {
  key?: unknown;
  kind?: unknown;
  routePath?: unknown;
  title?: unknown;
  description?: unknown;
};

export type RawContactLink = {
  label?: unknown;
  href?: unknown;
  icon?: unknown;
};

export type RawPrivatePage = {
  key?: unknown;
  title?: unknown;
  description?: unknown;
  robotsIndex?: unknown;
  robotsFollow?: unknown;
};

export const FALLBACK_REYNEILL_SITE_ROOT = "/Users/reyneill/Documents/code/reyneill";

const StringType = { kind: "primitive", name: "String" } as const;

export function resolveReyneillSiteRoot(siteRoot?: string): string {
  return path.resolve(siteRoot ?? process.env.BIP_REYNEILL_SITE_ROOT ?? process.env.REYNEILL_SITE_ROOT ?? FALLBACK_REYNEILL_SITE_ROOT);
}

export function loadReyneillWritingPosts(siteRoot?: string): RawWritingPost[] {
  return readJsonArray<RawWritingPost>(path.join(resolveReyneillSiteRoot(siteRoot), "public", "writing", "posts.json"));
}

export function loadReyneillProjects(siteRoot?: string): RawNeillProject[] {
  return readJsonArray<RawNeillProject>(path.join(resolveReyneillSiteRoot(siteRoot), "src", "data", "neill-projects.json"));
}

export function loadReyneillSiteCore(siteRoot?: string): RawSiteCore {
  return readJsonObject<RawSiteCore>(path.join(resolveReyneillSiteRoot(siteRoot), "src", "data", "site-core.json"));
}

export function buildPersonalSiteConstants(site: RawSiteCore): TSCoreConstant[] {
  const routes = siteRoutes(site);
  const primaryNavigation = primaryNavigationRoutes(site, routes);
  const metadata = site.siteMetadata ?? {};
  const metadataRoute = routes.find((route) => route.path === metadata.routePath) ?? routes[0] ?? {};
  const writingPage = sitePage(site, "writing");
  const neillIndustriesPage = sitePage(site, "neillIndustries");
  const adminPage = privatePage(site, "admin");
  const dashboardPage = privatePage(site, "dashboard");
  const signInPage = privatePage(site, "signIn");

  return [
    {
      kind: "constant",
      name: "siteRoutes",
      type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
      value: {
        kind: "array",
        items: routes.map(routeValue),
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldNonEmpty", field: "path" },
        { kind: "allItemsFieldNonEmpty", field: "label" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
      ],
    },
    {
      kind: "constant",
      name: "siteMetadata",
      type: { kind: "named", name: "SitePage" },
      value: {
        kind: "record",
        typeName: "SitePage",
        fields: {
          kind: pageKindValue(metadata.kind),
          route: routeValue(metadataRoute),
          title: stringValue(metadata.title),
          description: stringValue(metadata.description),
        },
      },
      contracts: [{ kind: "fieldEquals", field: "title", value: "Rey Neill" }],
    },
    {
      kind: "constant",
      name: "primaryNavigation",
      type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
      value: {
        kind: "array",
        items: primaryNavigation.map(routeValue),
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
        { kind: "allItemsFieldInConstant", field: "path", constant: "siteRoutes", constantField: "path" },
      ],
    },
    sitePageConstant("writingPageMetadata", writingPage, routes, "Writing — Rey Neill"),
    sitePageConstant("neillIndustriesPageMetadata", neillIndustriesPage, routes, "Neill Industries — Rey Neill"),
    privatePageConstant("adminPageMetadata", adminPage, "Admin — New Post"),
    privatePageConstant("dashboardPageMetadata", dashboardPage, "Dashboard"),
    privatePageConstant("signInPageMetadata", signInPage, "Sign In"),
    {
      kind: "constant",
      name: "homeProfile",
      type: { kind: "named", name: "HomeProfile" },
      value: homeProfileValue(site.homeProfile ?? {}),
      contracts: [{ kind: "fieldEquals", field: "headline", value: "Rey Neill." }],
    },
    {
      kind: "constant",
      name: "siteFooter",
      type: { kind: "named", name: "SiteFooter" },
      value: footerValue(site.footer ?? {}),
      contracts: [{ kind: "fieldEquals", field: "ownerName", value: "Rey Neill" }],
    },
    {
      kind: "constant",
      name: "contactLinks",
      type: { kind: "array", item: { kind: "named", name: "ContactLink" } },
      value: {
        kind: "array",
        items: contactLinks(site).map(contactLinkValue),
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldNonEmpty", field: "label" },
        { kind: "allItemsFieldNonEmpty", field: "href" },
        { kind: "allItemsFieldNonEmpty", field: "icon" },
        { kind: "allItemsFieldUnique", field: "label" },
        { kind: "allItemsFieldStartsWithOneOf", field: "href", prefixes: ["mailto:", "https://"] },
      ],
    },
  ];
}

export function buildReyneillWritingModule(rawPosts: RawWritingPost[]): TSCoreModule {
  return defineModule({
    name: "ReyneillWritingCore",
    records: [
      {
        kind: "record",
        name: "WritingPost",
        fields: [
          { name: "title", type: StringType },
          { name: "path", type: StringType },
          { name: "year", type: StringType },
          { name: "slug", type: StringType },
          { name: "date", type: StringType },
          { name: "summary", type: StringType },
        ],
      },
    ],
    unions: [],
    constants: [
      {
        kind: "constant",
        name: "writingPosts",
        type: { kind: "array", item: { kind: "named", name: "WritingPost" } },
        value: {
          kind: "array",
          items: rawPosts.map(postValue),
        },
        contracts: [
          { kind: "nonEmptyArray" },
          { kind: "allItemsFieldNonEmpty", field: "title" },
          { kind: "allItemsFieldNonEmpty", field: "path" },
          { kind: "allItemsFieldNonEmpty", field: "year" },
          { kind: "allItemsFieldNonEmpty", field: "slug" },
          { kind: "allItemsFieldNonEmpty", field: "date" },
          { kind: "allItemsFieldUnique", field: "path" },
          { kind: "allItemsFieldStartsWith", field: "path", prefix: "writing/" },
        ],
      },
    ],
    functions: [
      fieldAccessor("postPath", "post", "WritingPost", "path"),
      fieldAccessor("postTitle", "post", "WritingPost", "title"),
      fieldAccessor("postYear", "post", "WritingPost", "year"),
      fieldAccessor("postSlug", "post", "WritingPost", "slug"),
      fieldAccessor("postDate", "post", "WritingPost", "date"),
      fieldAccessor("postSummary", "post", "WritingPost", "summary"),
      {
        kind: "function",
        name: "postHref",
        parameters: [{ name: "post", type: { kind: "named", name: "WritingPost" } }],
        returns: StringType,
        body: {
          kind: "concat",
          parts: [
            { kind: "string", value: "/" },
            { kind: "field", target: { kind: "var", name: "post" }, field: "path" },
          ],
        },
        contracts: [{ kind: "returnsStartsWith", prefix: "/" }],
      },
    ],
    stateMachines: [],
  });
}

export function buildReyneillProjectModule(projects: RawNeillProject[]): TSCoreModule {
  return defineModule({
    name: "ReyneillProjectCore",
    records: [
      {
        kind: "record",
        name: "NeillProject",
        fields: [
          { name: "name", type: StringType },
          { name: "description", type: StringType },
          { name: "logo", type: StringType },
          { name: "url", type: StringType },
        ],
      },
    ],
    unions: [],
    constants: [
      {
        kind: "constant",
        name: "neillProjects",
        type: { kind: "array", item: { kind: "named", name: "NeillProject" } },
        value: {
          kind: "array",
          items: projects.map(projectValue),
        },
        contracts: [
          { kind: "nonEmptyArray" },
          { kind: "allItemsFieldNonEmpty", field: "name" },
          { kind: "allItemsFieldNonEmpty", field: "description" },
          { kind: "allItemsFieldUnique", field: "name" },
          { kind: "allItemsFieldEmptyOrStartsWith", field: "logo", prefix: "/" },
          { kind: "allItemsFieldEmptyOrStartsWith", field: "url", prefix: "https://" },
        ],
      },
    ],
    functions: [
      fieldAccessor("projectName", "project", "NeillProject", "name"),
      fieldAccessor("projectDescription", "project", "NeillProject", "description"),
      fieldAccessor("projectLogo", "project", "NeillProject", "logo"),
      fieldAccessor("projectUrl", "project", "NeillProject", "url"),
      {
        kind: "function",
        name: "isProjectLinked",
        parameters: [{ name: "project", type: { kind: "named", name: "NeillProject" } }],
        returns: { kind: "primitive", name: "Bool" },
        body: {
          kind: "stringNonEmpty",
          target: { kind: "field", target: { kind: "var", name: "project" }, field: "url" },
        },
        contracts: [{ kind: "nonEmptyFieldsPredicate", parameter: "project", fields: ["url"] }],
      },
    ],
    stateMachines: [],
  });
}

function fieldAccessor(name: string, parameter: string, recordName: string, field: string): TSCoreFunction {
  return {
    kind: "function",
    name,
    parameters: [{ name: parameter, type: { kind: "named", name: recordName } }],
    returns: StringType,
    body: { kind: "field", target: { kind: "var", name: parameter }, field },
    contracts: [{ kind: "returnsField", parameter, field }],
  };
}

function readJsonArray<T>(filePath: string): T[] {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed as T[];
}

function readJsonObject<T>(filePath: string): T {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  return parsed as T;
}

function stringValue(value: unknown): TSCoreExpr {
  return {
    kind: "string",
    value: typeof value === "string" ? value : "",
  };
}

function siteRoutes(site: RawSiteCore): RawSiteRoute[] {
  return Array.isArray(site.routes) ? site.routes as RawSiteRoute[] : [];
}

function primaryNavigationRoutes(site: RawSiteCore, routes: RawSiteRoute[]): RawSiteRoute[] {
  const paths = Array.isArray(site.primaryNavigationPaths) ? site.primaryNavigationPaths : [];

  return paths.flatMap((pathValue) => {
    const route = routes.find((candidate) => candidate.path === pathValue);
    return route ? [route] : [];
  });
}

function contactLinks(site: RawSiteCore): RawContactLink[] {
  return Array.isArray(site.contactLinks) ? site.contactLinks as RawContactLink[] : [];
}

function sitePages(site: RawSiteCore): RawSitePage[] {
  return Array.isArray(site.pages) ? site.pages as RawSitePage[] : [];
}

function sitePage(site: RawSiteCore, key: string): RawSitePage {
  return sitePages(site).find((page) => page.key === key) ?? {};
}

function privatePages(site: RawSiteCore): RawPrivatePage[] {
  return Array.isArray(site.privatePages) ? site.privatePages as RawPrivatePage[] : [];
}

function privatePage(site: RawSiteCore, key: string): RawPrivatePage {
  return privatePages(site).find((page) => page.key === key) ?? {};
}

function sitePageConstant(name: string, page: RawSitePage, routes: RawSiteRoute[], title: string): TSCoreConstant {
  return {
    kind: "constant",
    name,
    type: { kind: "named", name: "SitePage" },
    value: sitePageValue(page, routes),
    contracts: [{ kind: "fieldEquals", field: "title", value: title }],
  };
}

function privatePageConstant(name: string, page: RawPrivatePage, title: string): TSCoreConstant {
  return {
    kind: "constant",
    name,
    type: { kind: "named", name: "PrivatePageMetadata" },
    value: privatePageValue(page),
    contracts: [{ kind: "fieldEquals", field: "title", value: title }],
  };
}

function routeValue(route: RawSiteRoute): TSCoreExpr {
  return {
    kind: "record",
    typeName: "PageRoute",
    fields: {
      path: stringValue(route.path),
      label: stringValue(route.label),
    },
  };
}

function privatePageValue(page: RawPrivatePage): TSCoreExpr {
  return {
    kind: "record",
    typeName: "PrivatePageMetadata",
    fields: {
      title: stringValue(page.title),
      description: stringValue(page.description),
      robotsIndex: { kind: "bool", value: page.robotsIndex === true },
      robotsFollow: { kind: "bool", value: page.robotsFollow === true },
    },
  };
}

function sitePageValue(page: RawSitePage, routes: RawSiteRoute[]): TSCoreExpr {
  const route = routes.find((candidate) => candidate.path === page.routePath) ?? {};

  return {
    kind: "record",
    typeName: "SitePage",
    fields: {
      kind: pageKindValue(page.kind),
      route: routeValue(route),
      title: stringValue(page.title),
      description: stringValue(page.description),
    },
  };
}

function homeProfileValue(profile: NonNullable<RawSiteCore["homeProfile"]>): TSCoreExpr {
  return {
    kind: "record",
    typeName: "HomeProfile",
    fields: {
      headline: stringValue(profile.headline),
      mission: stringValue(profile.mission),
      rolePrefix: stringValue(profile.rolePrefix),
      employerLabel: stringValue(profile.employerLabel),
      employerHref: stringValue(profile.employerHref),
      roleSuffix: stringValue(profile.roleSuffix),
      contactLead: stringValue(profile.contactLead),
    },
  };
}

function footerValue(footer: NonNullable<RawSiteCore["footer"]>): TSCoreExpr {
  return {
    kind: "record",
    typeName: "SiteFooter",
    fields: {
      copyrightYear: stringValue(footer.copyrightYear),
      ownerName: stringValue(footer.ownerName),
    },
  };
}

function contactLinkValue(link: RawContactLink): TSCoreExpr {
  return {
    kind: "record",
    typeName: "ContactLink",
    fields: {
      label: stringValue(link.label),
      href: stringValue(link.href),
      icon: stringValue(link.icon),
    },
  };
}

function pageKindValue(kind: unknown): TSCoreExpr {
  return {
    kind: "variant",
    unionName: "PageKind",
    tag: "kind",
    variant: typeof kind === "string" ? kind : "",
  };
}

function pathParts(post: RawWritingPost): { year: string; slug: string } {
  const [, year = "", slug = ""] = typeof post.path === "string" ? post.path.replace(/^\/+|\/+$/g, "").split("/") : [];
  return { year, slug };
}

function postValue(post: RawWritingPost): TSCoreExpr {
  const { year, slug } = pathParts(post);

  return {
    kind: "record",
    typeName: "WritingPost",
    fields: {
      title: stringValue(post.title),
      path: stringValue(post.path),
      year: stringValue(year),
      slug: stringValue(slug),
      date: stringValue(post.date),
      summary: stringValue(post.summary),
    },
  };
}

function projectValue(project: RawNeillProject): TSCoreExpr {
  return {
    kind: "record",
    typeName: "NeillProject",
    fields: {
      name: stringValue(project.name),
      description: stringValue(project.description),
      logo: stringValue(project.logo),
      url: stringValue(project.url),
    },
  };
}
