import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { groupRepos, normaliseTopics, unusedTopicSettings } from "./topics.ts";
import type { GroupingOptions } from "./topics.ts";
import type { Repo } from "./types.ts";

const base: GroupingOptions = {
  groupBy: "topic",
  topicAliases: new Map(),
  ignoreTopics: new Set(),
  topicGroups: new Map(),
  multiGroup: false,
  topicPriority: [],
  languageAliases: new Map(),
  ungroupedLabel: "Ungrouped",
};

const labels = (groups: readonly { label: string }[]): string[] =>
  groups.map((g) => g.label);

test("aliases collapse variants, ignores drop noise, result is de-duplicated", () => {
  const out = normaliseTopics(["JS", "javascript", "hacktoberfest"], {
    topicAliases: new Map([["js", "javascript"]]),
    ignoreTopics: new Set(["hacktoberfest"]),
  });
  assert.deepEqual(out, ["javascript"]);
});

test("a repository without topics is ungrouped, and ungrouped sorts last", () => {
  const groups = groupRepos(
    [
      repo("a"),
      repo("b", { topics: ["zeta"] }),
      repo("c", { topics: ["alpha"] }),
    ],
    base,
  );
  assert.deepEqual(labels(groups), ["alpha", "zeta", "Ungrouped"]);
});

test("with a group score, unnamed headings are ordered by it, then alphabetically", () => {
  const groups = groupRepos(
    [
      repo("a", { topics: ["alpha"], stars: 1 }),
      repo("b", { topics: ["beta"], stars: 5 }),
      repo("c", { topics: ["gamma"], stars: 5 }),
      repo("d"),
    ],
    { ...base, groupScore: (rs) => rs.reduce((s, r) => s + r.stars, 0) },
  );
  assert.deepEqual(labels(groups), ["beta", "gamma", "alpha", "Ungrouped"]);
});

test("named groups keep their listed order even with a group score", () => {
  const groups = groupRepos(
    [
      repo("a", { topics: ["x"], stars: 1 }),
      repo("b", { topics: ["y"], stars: 9 }),
    ],
    {
      ...base,
      topicGroups: new Map([
        ["First", ["x"]],
        ["Second", ["y"]],
      ]),
      groupScore: (rs) => rs.reduce((s, r) => s + r.stars, 0),
    },
  );
  assert.deepEqual(labels(groups), ["First", "Second"]);
});

test("without a priority the alphabetically first topic is the heading", () => {
  const groups = groupRepos([repo("a", { topics: ["b", "a"] })], base);
  assert.deepEqual(labels(groups), ["a"]);
});

test("topic-priority picks the heading ahead of the alphabet", () => {
  const groups = groupRepos([repo("a", { topics: ["a", "b"] })], {
    ...base,
    topicPriority: ["b"],
  });
  assert.deepEqual(labels(groups), ["b"]);
});

test("named topic groups come first, in their listed order, and take the first match", () => {
  const options = {
    ...base,
    topicGroups: new Map([
      ["Fleet", ["commodore", "marshal"]],
      ["Web", ["react"]],
    ]),
  };
  const groups = groupRepos(
    [
      repo("a", { topics: ["marshal", "react"] }),
      repo("b", { topics: ["react"] }),
      repo("c", { topics: ["misc"] }),
    ],
    options,
  );
  assert.deepEqual(labels(groups), ["Fleet", "Web", "misc"]);
  assert.deepEqual(
    groups[0]?.repos.map((r) => r.name),
    ["a"],
  );
});

test("multi-group lists a repository under every matching group", () => {
  const groups = groupRepos([repo("a", { topics: ["marshal", "react"] })], {
    ...base,
    multiGroup: true,
    topicGroups: new Map([
      ["Fleet", ["marshal"]],
      ["Web", ["react"]],
    ]),
  });
  assert.deepEqual(labels(groups), ["Fleet", "Web"]);
});

test("group-by language uses the primary language and its alias", () => {
  const groups = groupRepos(
    [
      repo("a", { primaryLanguage: "TypeScript" }),
      repo("b", { primaryLanguage: "Shell" }),
      repo("c"),
    ],
    {
      ...base,
      groupBy: "language",
      languageAliases: new Map([["typescript", "TS"]]),
    },
  );
  assert.deepEqual(labels(groups), ["Shell", "TS", "Ungrouped"]);
});

test("group-by none gives one unheaded group", () => {
  const groups = groupRepos([repo("a"), repo("b")], {
    ...base,
    groupBy: "none",
  });
  assert.deepEqual(labels(groups), [""]);
  assert.equal(groups[0]?.repos.length, 2);
});

test("settings naming a topic no repository carries are reported", () => {
  const unused = unusedTopicSettings([repo("a", { topics: ["js"] })], {
    topicAliases: new Map([
      ["js", "javascript"],
      ["tpyo", "typo"],
    ]),
    ignoreTopics: new Set(["hacktoberfest"]),
    topicGroups: new Map([["Web", ["javascript", "react"]]]),
  });
  assert.deepEqual(unused, [
    "topic-aliases: tpyo",
    "ignore-topics: hacktoberfest",
    "topic-groups Web: react",
  ]);
});

test("group-by activity uses the shortest window with a commit, in order, skipping empty windows", () => {
  const at = (name: string, c: Partial<Repo["commits"]>): Repo =>
    repo(name, {
      commits: { last7: 0, last30: 0, last90: 0, last365: 0, ...c },
    });
  const groups = groupRepos(
    [
      at("old", {}),
      at("year", { last365: 3 }),
      at("week", { last7: 1, last30: 1, last90: 1, last365: 1 }),
      at("quarter", { last90: 2, last365: 2 }),
    ],
    { ...base, groupBy: "activity" },
  );
  assert.deepEqual(labels(groups), [
    "Last 7 days",
    "Last 90 days",
    "Last year",
    "Older",
  ]);
  assert.deepEqual(
    groups.map((g) => g.repos.map((r) => r.name)),
    [["week"], ["quarter"], ["year"], ["old"]],
  );
});
