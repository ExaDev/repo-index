import type { Repo } from "./types.ts";

/** A repository with made-up names, for tests; any field can be overridden. */
export function repo(name: string, overrides: Partial<Repo> = {}): Repo {
  return {
    name,
    nameWithOwner: `acme/${name}`,
    owner: "acme",
    url: `https://github.com/acme/${name}`,
    description: `The ${name} project`,
    isPrivate: false,
    isArchived: false,
    isFork: false,
    stars: 0,
    pushedAt: "2026-01-02T03:04:05Z",
    topics: [],
    primaryLanguage: null,
    languages: [],
    ...overrides,
  };
}
