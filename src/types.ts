export interface Language {
  readonly name: string;
  readonly size: number;
}

export interface CommitWindows {
  readonly last7: number;
  readonly last30: number;
  readonly last90: number;
  readonly last365: number;
}

export interface Repo {
  readonly name: string;
  readonly nameWithOwner: string;
  readonly owner: string;
  readonly url: string;
  readonly description: string | null;
  readonly isPrivate: boolean;
  readonly isArchived: boolean;
  readonly isFork: boolean;
  readonly stars: number;
  readonly pushedAt: string | null;
  readonly topics: readonly string[];
  readonly primaryLanguage: string | null;
  readonly languages: readonly Language[];
  /** Commits on the default branch in the last 7, 30, 90 and 365 days, each window including the shorter ones. */
  readonly commits: CommitWindows;
}

export type RelationKind = "depends-on" | "fork-of" | "template" | "mentions";

/** A directed relationship from one repository to another, both as `owner/name`. */
export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly kind: RelationKind;
}

/** What GitHub reports about one repository's links to other repositories, before any filtering. Entries are `owner/name`. */
export interface RawRelations {
  readonly parent: string | null;
  readonly template: string | null;
  /** Repositories that the dependency graph resolves this one's dependencies to. */
  readonly dependencies: readonly string[];
  /** Known repositories that the README names as `owner/name` or by URL. */
  readonly mentions: readonly string[];
}

export type Treatment = "include" | "count" | "exclude";

export interface Group {
  readonly label: string;
  readonly repos: readonly Repo[];
}
