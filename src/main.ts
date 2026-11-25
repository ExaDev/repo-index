import { appendFileSync } from "node:fs";
import { activityScore } from "./activity.ts";
import { assertCredentialSeesPrivate, readSettings } from "./config.ts";
import type { Settings } from "./config.ts";
import { fetchRelations, fetchRepos, isRepositoryPrivate } from "./github.ts";
import { findMissing, summaryTable, warning } from "./hygiene.ts";
import {
  buildEdges,
  findLeaks,
  relatedByRepo,
  slugIndex,
} from "./relations.ts";
import { compileRules } from "./rules.ts";
import { renderIndex } from "./render.ts";
import { resolveTargets, writeRegion } from "./region.ts";
import { groupRepos, normaliseTopics, unusedTopicSettings } from "./topics.ts";
import type { RawRelations, Repo, Treatment } from "./types.ts";

export interface Selection {
  readonly included: Repo[];
  readonly countedPrivate: number;
}

/**
 * Applies the archive, fork and rule filters. Repositories matched `exclude` are dropped, `count` ones only add to a private total and are never named.
 */
export function select(repos: readonly Repo[], settings: Settings): Selection {
  const { config } = settings;
  const treatment = compileRules(settings.rules, {
    public: "include",
    private: config.privateRepos,
  });
  const included: Repo[] = [];
  let countedPrivate = 0;
  for (const repo of repos) {
    if (repo.isArchived && !config.includeArchived) continue;
    if (repo.isFork && !config.includeForks) continue;
    const action: Treatment = treatment(repo);
    if (action === "include") included.push(repo);
    else if (action === "count" && repo.isPrivate) countedPrivate += 1;
  }
  return { included, countedPrivate };
}

/** A private repository's name in a public file discloses the project, so naming one requires a private target. */
export function assertSafeToName(
  included: readonly Repo[],
  targetIsPrivate: boolean,
): void {
  const leaked = included.filter((r) => r.isPrivate);
  if (leaked.length > 0 && !targetIsPrivate) {
    throw new Error(
      `${String(leaked.length)} private repositories would be named in a public repository. Use private-repos: exclude or count, or run in a private repository.`,
    );
  }
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file !== undefined) appendFileSync(file, `${name}=${value}\n`);
}

export async function run(): Promise<void> {
  const settings = readSettings();
  const { config } = settings;
  assertCredentialSeesPrivate(config.visibility, settings.credentialKind);

  const repos = await fetchRepos(
    settings.token,
    config.owner,
    config.visibility === "public" ? "PUBLIC" : null,
    new Date(),
  );
  const { included, countedPrivate } = select(repos, settings);
  if (included.length === 0) {
    throw new Error(
      `No repositories selected for ${config.owner}; refusing to write an empty index.`,
    );
  }

  const target = process.env.GITHUB_REPOSITORY;
  assertSafeToName(
    included,
    target === undefined
      ? false
      : await isRepositoryPrivate(settings.token, target),
  );

  const everyRepo = slugIndex(repos);
  const privateSlugs = new Set(
    repos.filter((r) => r.isPrivate).map((r) => r.nameWithOwner),
  );
  const wantsRelated =
    config.columns.includes("related") && config.relations.length > 0;
  const checksLeaks = config.leakPolicy !== "off" && privateSlugs.size > 0;
  const raw: ReadonlyMap<string, RawRelations> =
    wantsRelated || checksLeaks
      ? await fetchRelations(settings.token, included, everyRepo, config.marker)
      : new Map();

  const leaks = checksLeaks
    ? findLeaks(included, raw, everyRepo, (slug) => privateSlugs.has(slug))
    : [];
  for (const leak of leaks) {
    console.log(
      `${config.leakPolicy === "fail" ? "::error::" : "::warning::"}${leak.from} refers to the private repository ${leak.to} (${leak.where})`,
    );
  }
  setOutput("leaks", String(leaks.length));
  if (leaks.length > 0 && config.leakPolicy === "fail") {
    throw new Error(
      `${String(leaks.length)} public repositories refer to private ones; fix them, or set leak-policy: warn.`,
    );
  }
  const edges = wantsRelated
    ? buildEdges(included, raw, new Set(config.relations))
    : [];

  const groups = groupRepos(included, {
    groupBy: config.groupBy,
    topicAliases: settings.topicAliases,
    ignoreTopics: settings.ignoreTopics,
    topicGroups: settings.topicGroups,
    multiGroup: config.multiGroup,
    topicPriority: settings.topicPriority,
    languageAliases: settings.languageAliases,
    ungroupedLabel: config.ungroupedLabel,
    ...(config.sort === "activity"
      ? {
          groupScore: (members: readonly Repo[]) =>
            members.reduce(
              (sum, r) => sum + activityScore(r, config.activityHalfLife),
              0,
            ),
        }
      : {}),
  });
  const body = renderIndex(groups, {
    format: config.format,
    columns: config.columns,
    sort: config.sort,
    halfLifeDays: config.activityHalfLife,
    languages: {
      limit: config.languageLimit,
      minShare: config.minLanguageShare,
      ignored: settings.ignoredLanguages,
      aliases: settings.languageAliases,
    },
    topicsOf: (repo) => normaliseTopics(repo.topics, settings),
    countedPrivate,
    relations: {
      related: relatedByRepo(edges),
      named: new Map(included.map((r) => [r.nameWithOwner, r])),
      limit: config.relationsLimit,
    },
  });

  const missing = findMissing(included, config.require);
  for (const m of missing) {
    console.log(
      warning(`${m.repo.nameWithOwner} has no ${m.fields.join(" or ")}`),
    );
  }
  for (const unused of unusedTopicSettings(included, settings)) {
    console.log(warning(`Configured topic matches no repository: ${unused}`));
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined) appendFileSync(summary, summaryTable(missing));

  if (config.dryRun) {
    console.log(body);
  } else {
    const changed = writeRegion(config.outputPaths, config.marker, body);
    setOutput("changed", String(changed.length > 0));
    console.log(
      `Wrote ${String(changed.length)} of ${String(resolveTargets(config.outputPaths).length)} file(s).`,
    );
  }
  setOutput("repos", String(included.length));
  setOutput(
    "missing-description",
    String(missing.filter((m) => m.fields.includes("description")).length),
  );
  setOutput(
    "missing-topics",
    String(missing.filter((m) => m.fields.includes("topics")).length),
  );

  if (config.failOnMissing && missing.length > 0) {
    throw new Error(
      `${String(missing.length)} repositories are missing required metadata.`,
    );
  }
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
