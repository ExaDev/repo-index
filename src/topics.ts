import type { Group, Repo } from "./types.ts";

export interface GroupingOptions {
  readonly groupBy: "activity" | "topic" | "language" | "none";
  readonly topicAliases: ReadonlyMap<string, string>;
  readonly ignoreTopics: ReadonlySet<string>;
  readonly topicGroups: ReadonlyMap<string, readonly string[]>;
  readonly multiGroup: boolean;
  readonly topicPriority: readonly string[];
  readonly languageAliases: ReadonlyMap<string, string>;
  readonly ungroupedLabel: string;
  /** When given, headings that are not named topic groups are ordered by this score of their repositories, highest first, instead of alphabetically. */
  readonly groupScore?: (repos: readonly Repo[]) => number;
}

/** Headings for activity grouping, most recently active first. Each repository goes under the first window in which it has any commit on its default branch. */
export const ACTIVITY_BUCKETS = [
  "Last 7 days",
  "Last 30 days",
  "Last 90 days",
  "Last year",
  "Older",
] as const;

/** The heading of the shortest window in which the repository has a commit, or the last heading when it has none in the past year. */
export function activityBucket(repo: Repo): (typeof ACTIVITY_BUCKETS)[number] {
  const { last7, last30, last90, last365 } = repo.commits;
  if (last7 > 0) return "Last 7 days";
  if (last30 > 0) return "Last 30 days";
  if (last90 > 0) return "Last 90 days";
  if (last365 > 0) return "Last year";
  return "Older";
}

/** Applies aliases (case-insensitive) then drops ignored topics, de-duplicating the result. */
export function normaliseTopics(
  topics: readonly string[],
  options: Pick<GroupingOptions, "topicAliases" | "ignoreTopics">,
): string[] {
  const seen = new Set<string>();
  for (const topic of topics) {
    const lower = topic.toLowerCase();
    const canonical = options.topicAliases.get(lower) ?? lower;
    if (!options.ignoreTopics.has(canonical)) seen.add(canonical);
  }
  return [...seen];
}

function topicHeading(
  topics: readonly string[],
  priority: readonly string[],
): string | undefined {
  return priority.find((p) => topics.includes(p)) ?? [...topics].sort()[0];
}

/**
 * Splits repositories into headed groups. Named topic groups come first in their listed order, then single-topic or language headings alphabetically, then the ungrouped heading last. Repositories within a group are in input order.
 */
export function groupRepos(
  repos: readonly Repo[],
  options: GroupingOptions,
): Group[] {
  if (options.groupBy === "none") return [{ label: "", repos }];
  if (options.groupBy === "activity") {
    return ACTIVITY_BUCKETS.map((label) => ({
      label,
      repos: repos.filter((repo) => activityBucket(repo) === label),
    })).filter((group) => group.repos.length > 0);
  }

  const buckets = new Map<string, Repo[]>();
  const add = (label: string, repo: Repo): void => {
    const bucket = buckets.get(label);
    if (bucket === undefined) buckets.set(label, [repo]);
    else bucket.push(repo);
  };

  for (const repo of repos) {
    if (options.groupBy === "language") {
      const language = repo.primaryLanguage;
      add(
        language === null
          ? options.ungroupedLabel
          : (options.languageAliases.get(language.toLowerCase()) ?? language),
        repo,
      );
      continue;
    }
    const topics = normaliseTopics(repo.topics, options);
    const matched = [...options.topicGroups]
      .filter(([, members]) => members.some((m) => topics.includes(m)))
      .map(([label]) => label);
    if (matched.length > 0) {
      for (const label of options.multiGroup ? matched : matched.slice(0, 1)) {
        add(label, repo);
      }
      continue;
    }
    add(
      topicHeading(topics, options.topicPriority) ?? options.ungroupedLabel,
      repo,
    );
  }

  const named = [...options.topicGroups.keys()];
  const rank = (label: string): number =>
    label === options.ungroupedLabel ? 2 : named.includes(label) ? 0 : 1;
  return [...buckets]
    .sort(([a], [b]) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      if (rank(a) === 0) return named.indexOf(a) - named.indexOf(b);
      const score = options.groupScore;
      if (score !== undefined) {
        const byScore =
          score(buckets.get(b) ?? []) - score(buckets.get(a) ?? []);
        if (byScore !== 0) return byScore;
      }
      return a.localeCompare(b);
    })
    .map(([label, members]) => ({ label, repos: members }));
}

/**
 * Names configured in aliases, ignores or groups that no repository carries, so a typo in the configuration is visible instead of silently matching nothing.
 */
export function unusedTopicSettings(
  repos: readonly Repo[],
  options: Pick<
    GroupingOptions,
    "topicAliases" | "ignoreTopics" | "topicGroups"
  >,
): string[] {
  const raw = new Set(
    repos.flatMap((r) => r.topics.map((t) => t.toLowerCase())),
  );
  const aliased = new Set(
    [...raw].map((t) => options.topicAliases.get(t) ?? t),
  );
  const normalised = new Set(
    repos.flatMap((r) => normaliseTopics(r.topics, options)),
  );
  const unused: string[] = [];
  for (const alias of options.topicAliases.keys()) {
    if (!raw.has(alias)) unused.push(`topic-aliases: ${alias}`);
  }
  for (const topic of options.ignoreTopics) {
    if (!aliased.has(topic)) unused.push(`ignore-topics: ${topic}`);
  }
  for (const [label, members] of options.topicGroups) {
    for (const member of members) {
      if (!normalised.has(member))
        unused.push(`topic-groups ${label}: ${member}`);
    }
  }
  return unused;
}
