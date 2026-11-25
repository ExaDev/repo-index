import type { Edge, RawRelations, RelationKind, Repo } from "./types.ts";

export const RELATION_KINDS = [
  "depends-on",
  "fork-of",
  "template",
  "mentions",
] as const satisfies readonly RelationKind[];

/** Matches `owner/name`, optionally behind `github.com/`. The name part may end in punctuation that belongs to the sentence, which the caller strips. */
const SLUG_PATTERN = /(github\.com\/)?([a-z0-9][a-z0-9-]*)\/([a-z0-9._-]+)/gi;

/** Characters that, directly before a match, show it is part of a longer path or word rather than a repository reference. */
const WORD_BEFORE = /[a-z0-9._/-]/i;

/** A lookup from lower-case `owner/name` to the canonical spelling. */
export type SlugIndex = ReadonlyMap<string, string>;

export function slugIndex(repos: readonly Repo[]): SlugIndex {
  return new Map(
    repos.map((r) => [r.nameWithOwner.toLowerCase(), r.nameWithOwner]),
  );
}

/** `text` without any region between `<!-- marker:start -->` and `<!-- marker:end -->`, so an index's own generated list never counts as the README mentioning every repository it lists. */
export function withoutGeneratedRegion(text: string, marker: string): string {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(
      `<!-- ${escaped}:start -->[\\s\\S]*?<!-- ${escaped}:end -->`,
      "g",
    ),
    "",
  );
}

/**
 * The known repositories that `text` names as `owner/name` or as a github.com URL, never `self`, each once, in order of first appearance. Bare repository names are not references: only the full slug is, so a common word that happens to equal a repository name never counts.
 */
export function extractMentions(
  text: string,
  known: SlugIndex,
  self: string,
): string[] {
  const found: string[] = [];
  const own = self.toLowerCase();
  for (const match of text.matchAll(SLUG_PATTERN)) {
    const [, urlPrefix, owner, rawName] = match;
    const before = match.index > 0 ? text.charAt(match.index - 1) : "";
    if (urlPrefix === undefined && WORD_BEFORE.test(before)) continue;
    if (owner === undefined || rawName === undefined) continue;
    const name = rawName.replace(/[.-]+$/, "");
    const key = `${owner}/${name}`.toLowerCase();
    const canonical = known.get(key);
    if (canonical !== undefined && key !== own && !found.includes(canonical)) {
      found.push(canonical);
    }
  }
  return found;
}

/**
 * The relationships between the repositories that are about to be named. An edge is kept only when both ends are in `included`, so a repository that is excluded, counted without a name, archived or a fork left out never appears as an endpoint, and a public target (which only ever holds public repositories) can never carry an edge to a private one. A mention that duplicates a dependency edge is dropped.
 */
export function buildEdges(
  included: readonly Repo[],
  raw: ReadonlyMap<string, RawRelations>,
  kinds: ReadonlySet<RelationKind>,
): Edge[] {
  const names = slugIndex(included);
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (
    from: string,
    target: string | null,
    kind: RelationKind,
  ): void => {
    if (target === null || !kinds.has(kind)) return;
    const to = names.get(target.toLowerCase());
    if (to === undefined || to === from) return;
    const key = `${from}\u0000${to}\u0000${kind}`;
    const dependsKey = `${from}\u0000${to}\u0000depends-on`;
    if (seen.has(key)) return;
    if (kind === "mentions" && seen.has(dependsKey)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const repo of included) {
    const relations = raw.get(repo.nameWithOwner);
    if (relations === undefined) continue;
    const from = repo.nameWithOwner;
    add(from, relations.parent, "fork-of");
    add(from, relations.template, "template");
    for (const dependency of relations.dependencies)
      add(from, dependency, "depends-on");
    for (const mention of relations.mentions) add(from, mention, "mentions");
  }
  return edges;
}

export interface Related {
  readonly dependsOn: readonly string[];
  readonly usedBy: readonly string[];
  readonly forkOf: readonly string[];
  readonly forkedBy: readonly string[];
  readonly template: readonly string[];
  readonly templateFor: readonly string[];
  /** Repositories that mention this one or that it mentions, with the direction not distinguished. */
  readonly seeAlso: readonly string[];
}

const EMPTY: Related = {
  dependsOn: [],
  usedBy: [],
  forkOf: [],
  forkedBy: [],
  template: [],
  templateFor: [],
  seeAlso: [],
};

/** Every repository's relationships, from both ends of each edge, sorted by name. */
export function relatedByRepo(edges: readonly Edge[]): Map<string, Related> {
  const lists = new Map<string, Record<keyof Related, Set<string>>>();
  const of = (slug: string): Record<keyof Related, Set<string>> => {
    let entry = lists.get(slug);
    if (entry === undefined) {
      entry = {
        dependsOn: new Set(),
        usedBy: new Set(),
        forkOf: new Set(),
        forkedBy: new Set(),
        template: new Set(),
        templateFor: new Set(),
        seeAlso: new Set(),
      };
      lists.set(slug, entry);
    }
    return entry;
  };
  for (const { from, to, kind } of edges) {
    if (kind === "depends-on") {
      of(from).dependsOn.add(to);
      of(to).usedBy.add(from);
    } else if (kind === "fork-of") {
      of(from).forkOf.add(to);
      of(to).forkedBy.add(from);
    } else if (kind === "template") {
      of(from).template.add(to);
      of(to).templateFor.add(from);
    } else {
      of(from).seeAlso.add(to);
      of(to).seeAlso.add(from);
    }
  }
  const sorted = (set: Set<string>): string[] =>
    [...set].sort((a, b) => a.localeCompare(b));
  return new Map(
    [...lists].map(([slug, l]) => [
      slug,
      {
        dependsOn: sorted(l.dependsOn),
        usedBy: sorted(l.usedBy),
        forkOf: sorted(l.forkOf),
        forkedBy: sorted(l.forkedBy),
        template: sorted(l.template),
        templateFor: sorted(l.templateFor),
        seeAlso: sorted(l.seeAlso),
      },
    ]),
  );
}

export function relatedOf(
  map: ReadonlyMap<string, Related>,
  slug: string,
): Related {
  return map.get(slug) ?? EMPTY;
}

export interface Leak {
  /** The public repository whose text or manifests refer to a private one. */
  readonly from: string;
  /** The private repository it refers to. */
  readonly to: string;
  readonly where:
    | "description"
    | "topic"
    | "readme"
    | "dependency"
    | "fork-parent"
    | "template";
}

/**
 * Every place a public repository refers to a private one, which a public index would repeat or which is itself a disclosure. `known` must hold every fetched repository, private ones included, since a private name is only recognisable when it is known; a run that cannot see private repositories finds nothing here, and that is a limit of the credential, not proof of absence.
 */
export function findLeaks(
  repos: readonly Repo[],
  raw: ReadonlyMap<string, RawRelations>,
  known: SlugIndex,
  isPrivate: (slug: string) => boolean,
): Leak[] {
  const leaks: Leak[] = [];
  const push = (
    from: string,
    to: string | null,
    where: Leak["where"],
  ): void => {
    if (to === null) return;
    const canonical = known.get(to.toLowerCase());
    if (canonical !== undefined && isPrivate(canonical))
      leaks.push({ from, to: canonical, where });
  };
  for (const repo of repos) {
    if (repo.isPrivate) continue;
    const from = repo.nameWithOwner;
    for (const slug of extractMentions(repo.description ?? "", known, from))
      push(from, slug, "description");
    for (const slug of extractMentions(repo.topics.join(" "), known, from))
      push(from, slug, "topic");
    const relations = raw.get(from);
    if (relations === undefined) continue;
    push(from, relations.parent, "fork-parent");
    push(from, relations.template, "template");
    for (const slug of relations.dependencies) push(from, slug, "dependency");
    for (const slug of relations.mentions) push(from, slug, "readme");
  }
  return leaks;
}
