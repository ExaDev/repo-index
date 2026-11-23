import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import { buildEdges, relatedByRepo } from "./relations.ts";
import { renderIndex } from "./render.ts";
import type { RenderOptions } from "./render.ts";

const options: RenderOptions = {
  format: "table",
  columns: ["name", "description", "languages"],
  sort: "name",
  halfLifeDays: 30,
  relations: { related: new Map(), named: new Map(), limit: 6 },
  languages: { limit: 5, minShare: 5, ignored: new Set(), aliases: new Map() },
  countedPrivate: 0,
};

test("a table has a heading per group, bold primary language and escaped pipes", () => {
  const out = renderIndex(
    [
      {
        label: "Tools",
        repos: [
          repo("b", {
            description: "pipes | here\nand a newline",
            primaryLanguage: "Go",
            languages: [
              { name: "Go", size: 10 },
              { name: "Shell", size: 5 },
            ],
          }),
          repo("a"),
        ],
      },
    ],
    options,
  );
  assert.match(out, /### Tools/);
  assert.match(out, /\| Name \| Description \| Languages \|/);
  assert.match(
    out,
    /\| \[b\]\(https:\/\/github.com\/acme\/b\) \| pipes \\\| here and a newline \| \*\*Go\*\*, Shell \|/,
  );
  assert.ok(out.indexOf("[a]") < out.indexOf("[b]"), "rows are sorted by name");
});

test("a missing description renders a visible placeholder", () => {
  const out = renderIndex(
    [{ label: "", repos: [repo("a", { description: null })] }],
    options,
  );
  assert.match(out, /\(no description\)/);
  assert.doesNotMatch(out, /###/);
});

test("the summary counts repositories and primary languages", () => {
  const out = renderIndex(
    [
      {
        label: "x",
        repos: [
          repo("a", { primaryLanguage: "Go" }),
          repo("b", { primaryLanguage: "Go" }),
        ],
      },
    ],
    options,
  );
  assert.match(out, /^2 repositories\./);
  assert.match(out, /\*\*By language:\*\* Go \(2\)\./);
});

test("counted private repositories appear as a total only", () => {
  const out = renderIndex([{ label: "", repos: [repo("a")] }], {
    ...options,
    countedPrivate: 3,
  });
  assert.match(out, /And 3 private repositories\./);
});

test("list format renders one line per repository", () => {
  const out = renderIndex([{ label: "x", repos: [repo("a")] }], {
    ...options,
    format: "list",
  });
  assert.match(out, /- \[a\]\(https:\/\/github.com\/acme\/a\): The a project/);
});

test("sort by activity puts the busiest recent repository first", () => {
  const out = renderIndex(
    [
      {
        label: "x",
        repos: [
          repo("quiet", {
            commits: { last7: 0, last30: 0, last90: 0, last365: 2 },
          }),
          repo("busy", {
            commits: { last7: 9, last30: 20, last90: 30, last365: 40 },
          }),
        ],
      },
    ],
    { ...options, sort: "activity" },
  );
  assert.ok(out.indexOf("[busy]") < out.indexOf("[quiet]"));
});

test("sort by stars puts the most starred first", () => {
  const out = renderIndex(
    [{ label: "x", repos: [repo("a", { stars: 1 }), repo("b", { stars: 9 })] }],
    { ...options, sort: "stars" },
  );
  assert.ok(out.indexOf("[b]") < out.indexOf("[a]"));
});

test("the related column links each kind of relationship and limits long lists", () => {
  const a = repo("a");
  const b = repo("b");
  const c = repo("c");
  const d = repo("d");
  const edges = buildEdges(
    [a, b, c, d],
    new Map([
      [
        "acme/a",
        {
          parent: "acme/d",
          template: null,
          dependencies: ["acme/b", "acme/c"],
          mentions: [],
        },
      ],
    ]),
    new Set(["depends-on", "fork-of", "template", "mentions"] as const),
  );
  const named = new Map([a, b, c, d].map((r) => [r.nameWithOwner, r]));
  const out = renderIndex([{ label: "x", repos: [a, b, c, d] }], {
    ...options,
    columns: ["name", "related"],
    relations: { related: relatedByRepo(edges), named, limit: 1 },
  });
  assert.match(
    out,
    /\*\*Fork of\*\* \[d\]\(https:\/\/github.com\/acme\/d\)<br>\*\*Depends on\*\* \[b\]\(https:\/\/github.com\/acme\/b\) \+1/,
  );
  assert.match(out, /\*\*Used by\*\* \[a\]/);
  assert.match(out, /\*\*Forks\*\* \[a\]/);
});

test("a repository with no relationships has an empty related cell", () => {
  const out = renderIndex([{ label: "x", repos: [repo("a")] }], {
    ...options,
    columns: ["name", "related"],
  });
  assert.match(out, /\| \[a\]\(https:\/\/github.com\/acme\/a\) \| {2}\|/);
});
