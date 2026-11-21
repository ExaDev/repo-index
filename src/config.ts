import { existsSync, readFileSync } from "node:fs";
import * as z from "zod";
import { parse } from "yaml";
import { PERCENT } from "./languages.ts";
import { COLUMNS } from "./render.ts";
import { RulesSchema } from "./rules.ts";

function env(name: string): string {
  return (
    process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] ?? ""
  ).trim();
}

/** The first value that is neither undefined nor empty, or an empty string. */
function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  return values.find((v) => v !== undefined && v !== "") ?? "";
}

/** Inline YAML, or a path to a YAML file when the value names an existing file. */
function yamlValue(value: string): unknown {
  if (value === "") return undefined;
  return parse(existsSync(value) ? readFileSync(value, "utf8") : value);
}

function list(value: string): string[] {
  const parsed = yamlValue(value);
  if (parsed === undefined || parsed === null) return [];
  if (Array.isArray(parsed)) return parsed.map(String);
  if (typeof parsed !== "string") {
    throw new Error(`Expected a list or comma-separated text, got: ${value}`);
  }
  return parsed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function stringMap(value: string): Map<string, string> {
  const parsed = z
    .record(z.string(), z.string())
    .optional()
    .parse(yamlValue(value));
  return new Map(
    Object.entries(parsed ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

function lowerSet(value: string): Set<string> {
  return new Set(list(value).map((s) => s.toLowerCase()));
}

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

export const Config = z.object({
  owner: z
    .string()
    .min(1, "owner is required (no repository owner in the environment)"),
  visibility: z.enum(["public", "all"]),
  privateRepos: z.enum(["exclude", "count", "include"]),
  includeArchived: bool,
  includeForks: bool,
  outputPaths: z
    .array(z.string())
    .min(1, "output-paths needs at least one file"),
  marker: z.string().regex(/^[\w.-]+$/),
  format: z.enum(["table", "list"]),
  columns: z.array(z.enum(COLUMNS)).min(1),
  sort: z.enum(["name", "updated", "stars"]),
  ungroupedLabel: z.string().min(1),
  groupBy: z.enum(["topic", "language", "none"]),
  multiGroup: bool,
  languageLimit: z.coerce.number().int().min(1),
  minLanguageShare: z.coerce.number().min(0).max(PERCENT),
  require: z.array(z.enum(["description", "topics"])),
  failOnMissing: bool,
  dryRun: bool,
});

export interface Settings {
  readonly config: z.infer<typeof Config>;
  readonly rules: z.infer<typeof RulesSchema>;
  readonly topicAliases: Map<string, string>;
  readonly ignoreTopics: Set<string>;
  readonly topicGroups: Map<string, string[]>;
  readonly topicPriority: string[];
  readonly languageAliases: Map<string, string>;
  readonly ignoredLanguages: Set<string>;
  readonly token: string;
  readonly credentialKind: CredentialKind;
}

export type CredentialKind = "token" | "app" | "default";

/**
 * The default workflow token sees only public data (and its own repository), so a run asked for private repositories with it would silently list public ones only. That is refused instead.
 */
export function assertCredentialSeesPrivate(
  visibility: "public" | "all",
  kind: CredentialKind,
): void {
  if (visibility === "all" && kind === "default") {
    throw new Error(
      "visibility: all needs a credential that can see private repositories; set token, or app-id with app-private-key (the secrets may be unset or empty).",
    );
  }
}

/** Resolves the credential: a PAT, a minted App token (passed in as `app-token`), or the default workflow token; a PAT and an App together are rejected. */
function credential(): {
  readonly token: string;
  readonly kind: CredentialKind;
} {
  const pat = env("token");
  const appToken = env("app-token");
  if (pat !== "" && (env("app-id") !== "" || appToken !== "")) {
    throw new Error(
      "Give either token or app-id with app-private-key, not both.",
    );
  }
  if ((env("app-id") === "") !== (env("app-private-key") === "")) {
    throw new Error("app-id and app-private-key must be given together.");
  }
  const token = firstNonEmpty(pat, appToken, env("github-token"));
  const kind: CredentialKind =
    pat !== "" ? "token" : appToken !== "" ? "app" : "default";
  if (token === "")
    throw new Error(
      "No credential: set token, app-id with app-private-key, or the default github-token.",
    );
  return { token, kind };
}

function credentialFields(): { token: string; credentialKind: CredentialKind } {
  const { token, kind } = credential();
  return { token, credentialKind: kind };
}

export function readSettings(): Settings {
  const config = Config.parse({
    owner: firstNonEmpty(env("owner"), process.env.GITHUB_REPOSITORY_OWNER),
    visibility: firstNonEmpty(env("visibility"), "public"),
    privateRepos: firstNonEmpty(env("private-repos"), "exclude"),
    includeArchived: firstNonEmpty(env("include-archived"), "false"),
    includeForks: firstNonEmpty(env("include-forks"), "false"),
    outputPaths: env("output-paths")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    marker: firstNonEmpty(env("marker"), "repo-index"),
    format: firstNonEmpty(env("format"), "table"),
    columns: list(
      firstNonEmpty(env("columns"), "name, description, languages"),
    ),
    sort: firstNonEmpty(env("sort"), "name"),
    ungroupedLabel: firstNonEmpty(env("ungrouped-label"), "Ungrouped"),
    groupBy: firstNonEmpty(env("group-by"), "topic"),
    multiGroup: firstNonEmpty(env("multi-group"), "false"),
    languageLimit: firstNonEmpty(env("language-limit"), "5"),
    minLanguageShare: firstNonEmpty(env("min-language-share"), "5"),
    require: list(firstNonEmpty(env("require"), "description, topics")),
    failOnMissing: firstNonEmpty(env("fail-on-missing"), "false"),
    dryRun: firstNonEmpty(env("dry-run"), "false"),
  });
  const groups = z
    .record(z.string(), z.array(z.string()))
    .optional()
    .parse(yamlValue(env("topic-groups")));
  return {
    config,
    rules: RulesSchema.parse(yamlValue(env("rules")) ?? []),
    topicAliases: stringMap(env("topic-aliases")),
    ignoreTopics: lowerSet(env("ignore-topics")),
    topicGroups: new Map(
      Object.entries(groups ?? {}).map(([label, topics]) => [
        label,
        topics.map((t) => t.toLowerCase()),
      ]),
    ),
    topicPriority: list(env("topic-priority")).map((t) => t.toLowerCase()),
    languageAliases: stringMap(env("language-aliases")),
    ignoredLanguages: lowerSet(env("ignored-languages")),
    ...credentialFields(),
  };
}
