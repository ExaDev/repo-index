import type { Repo } from "./types.ts";

/** A share expressed as a percentage. */
export const PERCENT = 100;

export interface LanguageOptions {
  readonly limit: number;
  /** Minimum share of a repository's bytes, as a percentage, for a language to be listed. */
  readonly minShare: number;
  readonly ignored: ReadonlySet<string>;
  readonly aliases: ReadonlyMap<string, string>;
}

/**
 * The languages to show for a repository, largest first, with GitHub's primary language moved to the front. Languages below the share threshold, ignored ones and any beyond the limit are dropped.
 */
export function visibleLanguages(
  repo: Repo,
  options: LanguageOptions,
): string[] {
  const total = repo.languages.reduce((sum, l) => sum + l.size, 0);
  if (total === 0) return [];
  const kept = repo.languages
    .filter((l) => !options.ignored.has(l.name.toLowerCase()))
    .filter((l) => (l.size / total) * PERCENT >= options.minShare)
    .sort((a, b) => b.size - a.size)
    .map((l) => l.name);
  const primary = repo.primaryLanguage;
  if (primary !== null && kept.includes(primary)) {
    kept.splice(kept.indexOf(primary), 1);
    kept.unshift(primary);
  }
  return kept
    .slice(0, options.limit)
    .map((name) => options.aliases.get(name.toLowerCase()) ?? name);
}

/** Repository counts per primary language, most common first. */
export function languageCounts(
  repos: readonly Repo[],
  options: Pick<LanguageOptions, "aliases">,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    if (repo.primaryLanguage === null) continue;
    const name =
      options.aliases.get(repo.primaryLanguage.toLowerCase()) ??
      repo.primaryLanguage;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
