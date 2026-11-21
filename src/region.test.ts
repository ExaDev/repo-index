import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { replaceRegion, resolveTargets, writeRegion } from "./region.ts";

test("only the marked region is replaced", () => {
  const before = "# Title\n\n<!-- x:start -->\nold\n<!-- x:end -->\n\nFooter\n";
  const after = replaceRegion(before, "x", "new");
  assert.equal(
    after,
    "# Title\n\n<!-- x:start -->\nnew\n<!-- x:end -->\n\nFooter\n",
  );
});

test("replacing is idempotent", () => {
  const once = replaceRegion("# T\n", "x", "body");
  assert.equal(replaceRegion(once, "x", "body"), once);
});

test("missing markers are appended after a blank line", () => {
  assert.equal(
    replaceRegion("# T\n", "x", "b"),
    "# T\n\n<!-- x:start -->\nb\n<!-- x:end -->\n",
  );
});

test("unbalanced markers fail loudly", () => {
  assert.throws(
    () => replaceRegion("<!-- x:start -->\n", "x", "b"),
    /Unbalanced/,
  );
});

function layout(): { dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "repo-index-"));
  writeFileSync(join(dir, "README.md"), "# T\n");
  return { dir };
}

test("a symlink and its target are one file", () => {
  const { dir } = layout();
  symlinkSync("README.md", join(dir, "profile.md"));
  const targets = resolveTargets([
    join(dir, "README.md"),
    join(dir, "profile.md"),
  ]);
  assert.equal(targets.length, 1);
  assert.equal(
    writeRegion([join(dir, "README.md"), join(dir, "profile.md")], "x", "b")
      .length,
    1,
  );
});

test("separate files are each written with the same content", () => {
  const { dir } = layout();
  writeFileSync(join(dir, "profile.md"), "# P\n");
  const changed = writeRegion(
    [join(dir, "README.md"), join(dir, "profile.md")],
    "x",
    "b",
  );
  assert.equal(changed.length, 2);
  assert.match(
    readFileSync(join(dir, "profile.md"), "utf8"),
    /^# P\n\n<!-- x:start -->\nb/,
  );
  assert.equal(
    writeRegion([join(dir, "README.md"), join(dir, "profile.md")], "x", "b")
      .length,
    0,
  );
});

test("a dangling symlink fails loudly", () => {
  const { dir } = layout();
  symlinkSync("missing.md", join(dir, "dangling.md"));
  assert.throws(
    () => resolveTargets([join(dir, "dangling.md")]),
    /does not exist/,
  );
});
