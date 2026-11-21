import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { languageCounts, visibleLanguages } from "./languages.ts";

const options = {
  limit: 5,
  minShare: 5,
  ignored: new Set<string>(),
  aliases: new Map<string, string>(),
};
const withLanguages = repo("a", {
  primaryLanguage: "TypeScript",
  languages: [
    { name: "Shell", size: 100 },
    { name: "TypeScript", size: 800 },
    { name: "HTML", size: 10 },
    { name: "CSS", size: 90 },
  ],
});

test("languages are largest first, primary first, below the share dropped", () => {
  assert.deepEqual(visibleLanguages(withLanguages, options), [
    "TypeScript",
    "Shell",
    "CSS",
  ]);
});

test("ignored languages and the limit are applied", () => {
  assert.deepEqual(
    visibleLanguages(withLanguages, {
      ...options,
      ignored: new Set(["shell"]),
      limit: 1,
    }),
    ["TypeScript"],
  );
});

test("aliases rename a listed language", () => {
  assert.deepEqual(
    visibleLanguages(withLanguages, {
      ...options,
      aliases: new Map([["typescript", "TS"]]),
    })[0],
    "TS",
  );
});

test("a repository with no language lists nothing", () => {
  assert.deepEqual(visibleLanguages(repo("a"), options), []);
});

test("counts are by primary language, most common first", () => {
  const repos = [
    repo("a", { primaryLanguage: "Go" }),
    repo("b", { primaryLanguage: "Rust" }),
    repo("c", { primaryLanguage: "Rust" }),
    repo("d"),
  ];
  assert.deepEqual(languageCounts(repos, { aliases: new Map() }), [
    ["Rust", 2],
    ["Go", 1],
  ]);
});
