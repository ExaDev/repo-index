import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { assertSafeToName, select } from "./main.ts";
import { assertCredentialSeesPrivate } from "./config.ts";
import type { Settings } from "./config.ts";

function settings(
  overrides: Partial<Settings["config"]> = {},
  rules: Settings["rules"] = [],
): Settings {
  return {
    config: {
      owner: "acme",
      visibility: "all",
      privateRepos: "exclude",
      includeArchived: false,
      includeForks: false,
      outputPaths: ["README.md"],
      marker: "repo-index",
      format: "table",
      columns: ["name"],
      sort: "name",
      activityHalfLife: 30,
      relations: ["depends-on", "fork-of", "template", "mentions"],
      relationsLimit: 6,
      leakPolicy: "fail",
      ungroupedLabel: "Ungrouped",
      groupBy: "topic",
      multiGroup: false,
      languageLimit: 5,
      minLanguageShare: 5,
      require: [],
      failOnMissing: false,
      dryRun: false,
      ...overrides,
    },
    rules,
    topicAliases: new Map(),
    ignoreTopics: new Set(),
    topicGroups: new Map(),
    topicPriority: [],
    languageAliases: new Map(),
    ignoredLanguages: new Set(),
    token: "t",
    credentialKind: "token",
  };
}

const repos = [
  repo("pub"),
  repo("priv", { isPrivate: true }),
  repo("old", { isArchived: true }),
  repo("fork", { isFork: true }),
];

test("archived repositories and forks are dropped by default; private ones are excluded", () => {
  assert.deepEqual(
    select(repos, settings()).included.map((r) => r.name),
    ["pub"],
  );
});

test("private-repos count names none and adds to the total", () => {
  const out = select(repos, settings({ privateRepos: "count" }));
  assert.deepEqual(
    out.included.map((r) => r.name),
    ["pub"],
  );
  assert.equal(out.countedPrivate, 1);
});

test("private-repos include names them", () => {
  assert.deepEqual(
    select(repos, settings({ privateRepos: "include" })).included.map(
      (r) => r.name,
    ),
    ["pub", "priv"],
  );
});

test("archived and forks can be included", () => {
  const out = select(
    repos,
    settings({ includeArchived: true, includeForks: true }),
  );
  assert.deepEqual(
    out.included.map((r) => r.name),
    ["pub", "old", "fork"],
  );
});

test("an explicit include rule overrides the private default", () => {
  const out = select(
    repos,
    settings({}, [{ match: "priv", action: "include" }]),
  );
  assert.deepEqual(
    out.included.map((r) => r.name),
    ["pub", "priv"],
  );
});

test("naming a private repository in a public repository is refused", () => {
  const included = select(
    repos,
    settings({ privateRepos: "include" }),
  ).included;
  assert.throws(() => {
    assertSafeToName(included, false);
  }, /private repositories would be named/);
  assert.doesNotThrow(() => {
    assertSafeToName(included, true);
  });
  assert.doesNotThrow(() => {
    assertSafeToName([repo("pub")], false);
  });
});

test("a rule cannot smuggle a private name into a public target", () => {
  const included = select(
    repos,
    settings({}, [{ match: "priv", action: "include" }]),
  ).included;
  assert.throws(() => {
    assertSafeToName(included, false);
  });
});

test("asking for private repositories with only the default token is refused", () => {
  assert.throws(() => {
    assertCredentialSeesPrivate("all", "default");
  }, /needs a credential/);
  assert.doesNotThrow(() => {
    assertCredentialSeesPrivate("all", "app");
  });
  assert.doesNotThrow(() => {
    assertCredentialSeesPrivate("all", "token");
  });
  assert.doesNotThrow(() => {
    assertCredentialSeesPrivate("public", "default");
  });
});
