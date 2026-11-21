export interface Language {
  readonly name: string;
  readonly size: number;
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
}

export type Treatment = "include" | "count" | "exclude";

export interface Group {
  readonly label: string;
  readonly repos: readonly Repo[];
}
