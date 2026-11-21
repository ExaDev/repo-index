import * as z from "zod";
import type { Repo, Treatment } from "./types.ts";

const PropertyMatch = z.strictObject({
  visibility: z.enum(["public", "private"]).optional(),
  org: z.string().optional(),
  topic: z.string().optional(),
  lang: z.string().optional(),
});

export const RuleSchema = z.strictObject({
  match: z.union([z.string(), PropertyMatch]),
  action: z.enum(["include", "count", "exclude"]),
});
export const RulesSchema = z.array(RuleSchema);
export type Rule = z.infer<typeof RuleSchema>;

/**
 * Compiles a name matcher: a `/regex/` literal, or a glob over `owner/repo` where `*` matches within a path segment and `**` across segments. A glob without a slash matches the repository name alone.
 */
function nameMatcher(pattern: string): (repo: Repo) => boolean {
  if (pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
    const regex = new RegExp(pattern.slice(1, -1));
    return (repo) => regex.test(repo.nameWithOwner);
  }
  const source = pattern
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  const regex = new RegExp(`^${source}$`, "i");
  const hasOwner = pattern.includes("/");
  return (repo) => regex.test(hasOwner ? repo.nameWithOwner : repo.name);
}

function propertyMatcher(
  match: z.infer<typeof PropertyMatch>,
): (repo: Repo) => boolean {
  return (repo) =>
    (match.visibility === undefined ||
      (match.visibility === "private") === repo.isPrivate) &&
    (match.org === undefined ||
      match.org.toLowerCase() === repo.owner.toLowerCase()) &&
    (match.topic === undefined ||
      repo.topics.some(
        (t) => t.toLowerCase() === match.topic?.toLowerCase(),
      )) &&
    (match.lang === undefined ||
      repo.primaryLanguage?.toLowerCase() === match.lang.toLowerCase());
}

/**
 * Returns a function giving a repository's treatment: the action of the first rule that matches, else the supplied default for its visibility.
 */
export function compileRules(
  rules: readonly Rule[],
  defaults: { readonly public: Treatment; readonly private: Treatment },
): (repo: Repo) => Treatment {
  const compiled = rules.map((rule) => ({
    action: rule.action,
    matches:
      typeof rule.match === "string"
        ? nameMatcher(rule.match)
        : propertyMatcher(rule.match),
  }));
  return (repo) =>
    compiled.find((rule) => rule.matches(repo))?.action ??
    (repo.isPrivate ? defaults.private : defaults.public);
}
