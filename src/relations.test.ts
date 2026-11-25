import assert from "node:assert/strict";
import { test } from "node:test";
import { repo } from "./fixtures.ts";
import {
  buildEdges,
  extractMentions,
  withoutGeneratedRegion,
  findLeaks,
  relatedByRepo,
  relatedOf,
  slugIndex,
} from "./relations.ts";
import type { RawRelations, RelationKind } from "./types.ts";

const ALL = new Set<RelationKind>([
  "depends-on",
  "fork-of",
  "template",
  "mentions",
]);
const none: RawRelations = {
  parent: null,
  template: null,
  dependencies: [],
  mentions: [],
};
const raw = (o: Partial<RawRelations>): RawRelations => ({ ...none, ...o });

const a = repo("a");
const b = repo("b");
const c = repo("c");
const secret = repo("secret", { isPrivate: true });

test("a slug and a github.com URL are references, a bare name is not", () => {
  const known = slugIndex([a, b, c]);
  const text =
    "Uses acme/b and https://github.com/acme/c/issues, also a and b alone, and x.com/acme/a";
  assert.deepEqual(extractMentions(text, known, "acme/a"), [
    "acme/b",
    "acme/c",
  ]);
});

test("a slug inside a longer path or word is not a reference", () => {
  const known = slugIndex([a, b]);
  assert.deepEqual(
    extractMentions(
      "see xacme/b and acme/b-extra and ./acme/b",
      known,
      "acme/a",
    ),
    [],
  );
});

test("sentence punctuation after a slug is not part of the name", () => {
  const known = slugIndex([a, b]);
  assert.deepEqual(
    extractMentions("Built on acme/b. Also (acme/b).", known, "acme/a"),
    ["acme/b"],
  );
});

test("a repository never mentions itself and matching ignores case", () => {
  const known = slugIndex([a, b]);
  assert.deepEqual(extractMentions("ACME/A and Acme/B", known, "acme/a"), [
    "acme/b",
  ]);
});

test("edges join only repositories that are both named", () => {
  const edges = buildEdges(
    [a, b],
    new Map([
      [
        "acme/a",
        raw({
          dependencies: ["acme/b", "acme/c", "other/x"],
          parent: "acme/c",
        }),
      ],
    ]),
    ALL,
  );
  assert.deepEqual(edges, [
    { from: "acme/a", to: "acme/b", kind: "depends-on" },
  ]);
});

test("an edge to a repository that is not named is never drawn, so a public index cannot carry a private end", () => {
  const edges = buildEdges(
    [a],
    new Map([
      [
        "acme/a",
        raw({
          dependencies: ["acme/secret"],
          mentions: ["acme/secret"],
          template: "acme/secret",
        }),
      ],
    ]),
    ALL,
  );
  assert.deepEqual(edges, []);
});

test("kinds not requested are dropped, and a mention that repeats a dependency is dropped", () => {
  const rawMap = new Map([
    [
      "acme/a",
      raw({
        dependencies: ["acme/b"],
        mentions: ["acme/b", "acme/c"],
        parent: "acme/c",
      }),
    ],
  ]);
  const some = buildEdges(
    [a, b, c],
    rawMap,
    new Set<RelationKind>(["depends-on", "mentions"]),
  );
  assert.deepEqual(some, [
    { from: "acme/a", to: "acme/b", kind: "depends-on" },
    { from: "acme/a", to: "acme/c", kind: "mentions" },
  ]);
});

test("relationships are read from both ends and sorted", () => {
  const edges = buildEdges(
    [a, b, c],
    new Map([
      [
        "acme/a",
        raw({ dependencies: ["acme/c", "acme/b"], mentions: ["acme/b"] }),
      ],
      ["acme/c", raw({ parent: "acme/b", mentions: ["acme/a"] })],
    ]),
    ALL,
  );
  const map = relatedByRepo(edges);
  assert.deepEqual(relatedOf(map, "acme/a").dependsOn, ["acme/b", "acme/c"]);
  assert.deepEqual(relatedOf(map, "acme/b").usedBy, ["acme/a"]);
  assert.deepEqual(relatedOf(map, "acme/b").forkedBy, ["acme/c"]);
  assert.deepEqual(relatedOf(map, "acme/c").forkOf, ["acme/b"]);
  assert.deepEqual(relatedOf(map, "acme/c").seeAlso, ["acme/a"]);
  assert.deepEqual(relatedOf(map, "acme/a").seeAlso, ["acme/c"]);
  assert.deepEqual(relatedOf(map, "acme/missing").dependsOn, []);
});

const known = slugIndex([a, b, secret]);
const isPrivate = (slug: string): boolean => slug === "acme/secret";

test("a public repository that names a private one is a leak wherever it does so", () => {
  const leaky = repo("leaky", {
    description: "Wraps acme/secret",
    topics: [],
  });
  const leaks = findLeaks(
    [leaky, repo("quiet")],
    new Map([
      [
        "acme/leaky",
        raw({
          dependencies: ["acme/secret"],
          mentions: ["acme/secret"],
          parent: "acme/secret",
          template: "acme/secret",
        }),
      ],
    ]),
    slugIndex([leaky, repo("quiet"), secret]),
    isPrivate,
  );
  assert.deepEqual(leaks.map((l) => l.where).sort(), [
    "dependency",
    "description",
    "fork-parent",
    "readme",
    "template",
  ]);
  assert.ok(
    leaks.every((l) => l.from === "acme/leaky" && l.to === "acme/secret"),
  );
});

test("a private repository naming another private one is not a leak, and a public one naming a public one is not", () => {
  const privateA = repo("pa", {
    isPrivate: true,
    description: "Uses acme/secret",
  });
  const publicA = repo("pub", { description: "Uses acme/b" });
  const leaks = findLeaks(
    [privateA, publicA],
    new Map([["acme/pub", raw({ dependencies: ["acme/b"] })]]),
    known,
    isPrivate,
  );
  assert.deepEqual(leaks, []);
});

test("a generated index region is not a mention of every repository it lists", () => {
  const text =
    "See acme/a.\n<!-- repo-index:start -->\n| acme/b |\n<!-- repo-index:end -->\nAnd acme/c.";
  assert.equal(
    withoutGeneratedRegion(text, "repo-index"),
    "See acme/a.\n\nAnd acme/c.",
  );
  assert.equal(withoutGeneratedRegion(text, "other"), text);
});
