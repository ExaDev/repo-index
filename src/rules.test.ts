import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { compileRules } from "./rules.ts";

const defaults = { public: "include", private: "exclude" } as const;

test("the first matching rule wins", () => {
  const treat = compileRules(
    [
      { match: "acme/keep-*", action: "include" },
      { match: "acme/*", action: "exclude" },
    ],
    defaults,
  );
  assert.equal(treat(repo("keep-me")), "include");
  assert.equal(treat(repo("other")), "exclude");
});

test("unmatched repositories take the default for their visibility", () => {
  const treat = compileRules([], defaults);
  assert.equal(treat(repo("a")), "include");
  assert.equal(treat(repo("b", { isPrivate: true })), "exclude");
});

test("a glob without a slash matches the repository name", () => {
  const treat = compileRules([{ match: "tmp-*", action: "exclude" }], defaults);
  assert.equal(treat(repo("tmp-scratch")), "exclude");
  assert.equal(treat(repo("scratch")), "include");
});

test("a regex literal matches owner/repo", () => {
  const treat = compileRules(
    [{ match: "/-archive$/", action: "exclude" }],
    defaults,
  );
  assert.equal(treat(repo("old-archive")), "exclude");
  assert.equal(treat(repo("archive-old")), "include");
});

test("property matches combine as a conjunction", () => {
  const treat = compileRules(
    [
      {
        match: { visibility: "private", topic: "client", lang: "Go" },
        action: "count",
      },
    ],
    defaults,
  );
  const hit = repo("a", {
    isPrivate: true,
    topics: ["Client"],
    primaryLanguage: "go",
  });
  assert.equal(treat(hit), "count");
  assert.equal(treat({ ...hit, primaryLanguage: "Rust" }), "exclude");
  assert.equal(treat({ ...hit, topics: [] }), "exclude");
});

test("an org match is case-insensitive", () => {
  const treat = compileRules(
    [{ match: { org: "ACME" }, action: "exclude" }],
    defaults,
  );
  assert.equal(treat(repo("a")), "exclude");
});
