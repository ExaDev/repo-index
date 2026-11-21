import { languageCounts, visibleLanguages } from "./languages.ts";
import type { LanguageOptions } from "./languages.ts";
import type { Group, Repo } from "./types.ts";

export const COLUMNS = [
  "name",
  "description",
  "languages",
  "stars",
  "updated",
  "visibility",
] as const;
export type Column = (typeof COLUMNS)[number];

export interface RenderOptions {
  readonly format: "table" | "list";
  readonly columns: readonly Column[];
  readonly sort: "name" | "updated" | "stars";
  readonly languages: LanguageOptions;
  /** Number of repositories counted but not named. */
  readonly countedPrivate: number;
}

/** Length of the `YYYY-MM-DD` prefix of an ISO timestamp. */
const DATE_LENGTH = 10;

const NO_DESCRIPTION = "(no description)";

function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function languagesText(repo: Repo, options: RenderOptions): string {
  return visibleLanguages(repo, options.languages)
    .map((name, index) => (index === 0 ? `**${name}**` : name))
    .join(", ");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled column: ${String(value)}`);
}

function columnValue(
  column: Column,
  repo: Repo,
  options: RenderOptions,
): string {
  switch (column) {
    case "name":
      return `[${repo.name}](${repo.url})`;
    case "description":
      return cell(repo.description ?? NO_DESCRIPTION);
    case "languages":
      return languagesText(repo, options);
    case "stars":
      return String(repo.stars);
    case "updated":
      return repo.pushedAt?.slice(0, DATE_LENGTH) ?? "";
    case "visibility":
      return repo.isPrivate ? "private" : "public";
    default:
      return assertNever(column);
  }
}

function sortRepos(
  repos: readonly Repo[],
  sort: RenderOptions["sort"],
): Repo[] {
  const byName = (a: Repo, b: Repo): number => a.name.localeCompare(b.name);
  return [...repos].sort((a, b) => {
    if (sort === "stars") return b.stars - a.stars || byName(a, b);
    if (sort === "updated") {
      return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || byName(a, b);
    }
    return byName(a, b);
  });
}

function renderGroup(group: Group, options: RenderOptions): string {
  const repos = sortRepos(group.repos, options.sort);
  const heading = group.label === "" ? [] : [`### ${group.label}`, ""];
  if (options.format === "list") {
    return [
      ...heading,
      ...repos.map((repo) => {
        const languages = languagesText(repo, options);
        const description = repo.description ?? NO_DESCRIPTION;
        return `- [${repo.name}](${repo.url}): ${description.replace(/\r?\n/g, " ")}${languages === "" ? "" : ` (${languages})`}`;
      }),
    ].join("\n");
  }
  const header = options.columns.map(
    (c) => `${c.charAt(0).toUpperCase()}${c.slice(1)}`,
  );
  return [
    ...heading,
    `| ${header.join(" | ")} |`,
    `| ${options.columns.map(() => "---").join(" | ")} |`,
    ...repos.map(
      (repo) =>
        `| ${options.columns.map((c) => columnValue(c, repo, options)).join(" | ")} |`,
    ),
  ].join("\n");
}

/**
 * The generated Markdown for the index region: a language summary, one section per group and a count of private repositories that are counted but not named.
 */
export function renderIndex(
  groups: readonly Group[],
  options: RenderOptions,
): string {
  const repos = groups.flatMap((g) => g.repos);
  const unique = new Set(repos.map((r) => r.nameWithOwner));
  const counts = languageCounts(repos, options.languages);
  const lines = [`${String(unique.size)} repositories.`];
  if (counts.length > 0) {
    lines.push(
      `**By language:** ${counts.map(([name, n]) => `${name} (${String(n)})`).join(", ")}.`,
    );
  }
  const sections = groups.map((g) => renderGroup(g, options));
  const footer =
    options.countedPrivate > 0
      ? [
          `And ${String(options.countedPrivate)} private ${options.countedPrivate === 1 ? "repository" : "repositories"}.`,
        ]
      : [];
  return [lines.join("\n\n"), ...sections, ...footer].join("\n\n");
}
