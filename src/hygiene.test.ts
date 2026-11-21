import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { findMissing, summaryTable, warning } from "./hygiene.ts";

test("each repository lacking a required field is reported with which", () => {
  const missing = findMissing(
    [
      repo("a", { description: null }),
      repo("b", { description: null, topics: ["x"] }),
      repo("c", { topics: ["x"] }),
    ],
    ["description", "topics"],
  );
  assert.deepEqual(
    missing.map((m) => [m.repo.name, m.fields]),
    [
      ["a", ["description", "topics"]],
      ["b", ["description"]],
    ],
  );
});

test("a field that is not required is not reported", () => {
  assert.deepEqual(
    findMissing([repo("a", { description: null })], ["topics"]).map(
      (m) => m.repo.name,
    ),
    ["a"],
  );
  assert.deepEqual(
    findMissing([repo("a", { topics: ["x"] })], ["description"]),
    [],
  );
});

test("annotation messages are escaped", () => {
  assert.equal(warning("100%\nnext"), "::warning::100%25%0Anext");
});

test("the summary table is empty when nothing is missing", () => {
  assert.equal(summaryTable([]), "");
  assert.match(
    summaryTable(
      findMissing([repo("a", { description: null })], ["description"]),
    ),
    /\| \[acme\/a\]/,
  );
});
