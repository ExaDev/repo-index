import type { Repo } from "./types.ts";

export type Requirement = "description" | "topics";

export interface Missing {
  readonly repo: Repo;
  readonly fields: readonly Requirement[];
}

/** The repositories that lack a required field, with which fields are missing. */
export function findMissing(
  repos: readonly Repo[],
  required: readonly Requirement[],
): Missing[] {
  return repos.flatMap((repo) => {
    const fields = required.filter((field) =>
      field === "description"
        ? repo.description === null
        : repo.topics.length === 0,
    );
    return fields.length === 0 ? [] : [{ repo, fields }];
  });
}

/** A workflow command annotation; the message is escaped as the runner requires. */
export function warning(message: string): string {
  const escaped = message
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  return `::warning::${escaped}`;
}

/** The job-summary table of repositories missing metadata. */
export function summaryTable(missing: readonly Missing[]): string {
  if (missing.length === 0) return "";
  return [
    "### Missing metadata",
    "",
    "| Repository | Missing |",
    "| --- | --- |",
    ...missing.map(
      (m) =>
        `| [${m.repo.nameWithOwner}](${m.repo.url}) | ${m.fields.join(", ")} |`,
    ),
    "",
  ].join("\n");
}
