import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { groupRepos, normaliseTopics, unusedTopicSettings } from "./topics.ts";
import type { GroupingOptions } from "./topics.ts";

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
