import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

/**
 * Replaces the text between the start and end markers, or appends the marked region when the markers are absent. Everything outside the markers is returned unchanged.
 */
export function replaceRegion(
  content: string,
  marker: string,
  body: string,
): string {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const region = `${start}\n${body}\n${end}`;
  const from = content.indexOf(start);
  const to = content.indexOf(end);
  if (from === -1 && to === -1) {
    const separator =
      content === "" || content.endsWith("\n\n")
        ? ""
        : content.endsWith("\n")
          ? "\n"
          : "\n\n";
    return `${content}${separator}${region}\n`;
  }
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      `Unbalanced markers for "${marker}": expected ${start} before ${end}.`,
    );
  }
  return content.slice(0, from) + region + content.slice(to + end.length);
}

/** Whether the path is itself a symbolic link, whether or not its target exists. */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Resolves each output path to the file that is really written, so a symlink and its target are written once. A symlink whose target is missing is an error, never silently recreated.
 */
export function resolveTargets(paths: readonly string[]): string[] {
  const real = new Set<string>();
  for (const path of paths) {
    const absolute = resolve(path);
    if (isSymlink(absolute) && !existsSync(absolute)) {
      throw new Error(`${path} is a symlink whose target does not exist.`);
    }
    real.add(existsSync(absolute) ? realpathSync(absolute) : absolute);
  }
  return [...real];
}

/** Writes the region into each target file and returns the files whose content changed. */
export function writeRegion(
  paths: readonly string[],
  marker: string,
  body: string,
): string[] {
  const changed: string[] = [];
  for (const target of resolveTargets(paths)) {
    const before = existsSync(target) ? readFileSync(target, "utf8") : "";
    const after = replaceRegion(before, marker, body);
    if (after !== before) {
      writeFileSync(target, after);
      changed.push(target);
    }
  }
  return changed;
}
