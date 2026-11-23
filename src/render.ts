import { compareByActivity } from "./activity.ts";
import { languageCounts, visibleLanguages } from "./languages.ts";
import type { LanguageOptions } from "./languages.ts";
import { relatedOf } from "./relations.ts";
import type { Related } from "./relations.ts";
import type { Group, Repo } from "./types.ts";

export const COLUMNS = [
  "name",
  "description",
  "languages",
  "related",
  "stars",
  "updated",
  "visibility",
] as const;
export type Column = (typeof COLUMNS)[number];

export interface RenderOptions {
  readonly format: "table" | "list";
  readonly columns: readonly Column[];
  readonly sort: "activity" | "name" | "updated" | "stars";
  /** Half-life, in days, of a commit's weight when sorting by activity. */
  readonly halfLifeDays: number;
  readonly languages: LanguageOptions;
  /** Number of repositories counted but not named. */
  readonly countedPrivate: number;
  readonly relations: RelationsRender;
}

export interface RelationsRender {
  /** Every named repository's relationships, which only ever join repositories that are named in this output. */
  readonly related: ReadonlyMap<string, Related>;
  /** The repositories named in this output, by `owner/name`. */
  readonly named: ReadonlyMap<string, Repo>;
  /** Most repositories listed per kind of relationship before "+N". */
  readonly limit: number;
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

function relatedText(repo: Repo, options: RenderOptions): string {
  const { related, named, limit } = options.relations;
  const entry = relatedOf(related, repo.nameWithOwner);
  const link = (slug: string): string => {
    const other = named.get(slug);
    return other === undefined ? slug : `[${other.name}](${other.url})`;
  };
  const parts: string[] = [];
  const add = (label: string, slugs: readonly string[]): void => {
    if (slugs.length === 0) return;
    const more = slugs.length - limit;
    parts.push(
      `**${label}** ${slugs.slice(0, limit).map(link).join(", ")}${more > 0 ? ` +${String(more)}` : ""}`,
    );
  };
  add("Fork of", entry.forkOf);
  add("From template", entry.template);
  add("Depends on", entry.dependsOn);
  add("Used by", entry.usedBy);
  add("Forks", entry.forkedBy);
  add("Template for", entry.templateFor);
  add("See also", entry.seeAlso);
  return parts.join("<br>");
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
    case "related":
      return relatedText(repo, options);
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
  options: Pick<RenderOptions, "sort" | "halfLifeDays">,
): Repo[] {
  const byName = (a: Repo, b: Repo): number => a.name.localeCompare(b.name);
  const compare = ((): ((a: Repo, b: Repo) => number) => {
    if (options.sort === "activity") {
      return compareByActivity(options.halfLifeDays);
    }
    if (options.sort === "stars") {
      return (a, b) => b.stars - a.stars || byName(a, b);
    }
    if (options.sort === "updated") {
      return (a, b) =>
        (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || byName(a, b);
    }
    return byName;
  })();
  return [...repos].sort(compare);
}

function renderGroup(group: Group, options: RenderOptions): string {
  const repos = sortRepos(group.repos, options);
  const heading = group.label === "" ? [] : [`### ${group.label}`, ""];
  if (options.format === "list") {
    return [
      ...heading,
      ...repos.map((repo) => {
        const languages = languagesText(repo, options);
        const description = repo.description ?? NO_DESCRIPTION;
        const related = options.columns.includes("related")
          ? relatedText(repo, options).replaceAll("<br>", "; ")
          : "";
        return `- [${repo.name}](${repo.url}): ${description.replace(/\r?\n/g, " ")}${languages === "" ? "" : ` (${languages})`}${related === "" ? "" : `. ${related}`}`;
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
