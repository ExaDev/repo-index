# repo-index

> A GitHub Action that keeps a grouped list of an owner's repositories, with descriptions and languages, up to date inside a README. It is for maintainers of an organisation or personal profile README, or of a private index of their own repositories.

It rewrites only the region between two marker comments, so the rest of the file stays hand-written.

```markdown
<!-- repo-index:start -->
<!-- repo-index:end -->
```

The action only writes files. Committing the result stays in your workflow, so it needs no write token of its own.

## Who it is for

Maintainers of a GitHub organisation or personal account who want a current, readable list of its repositories in a profile README or a private index, without writing it by hand.

## Prerequisites

- A GitHub repository with a README to hold the index, and GitHub Actions enabled on it.
- Optional: a credential, only when the index must include private repositories. See [Credentials](#credentials).

## Install

There is nothing to install. Add `uses: ExaDev/repo-index@v1` to a workflow in the repository that holds the README, as in the example below.

## Use

First add the markers to the README that should hold the index. The action creates them at the end of the file if they are missing, but placing them yourself decides where the list goes.

The smallest workflow needs no secret. It indexes the owner's public repositories with the workflow's own token:

```yaml
name: Repo index
on:
  schedule: [{ cron: "0 6 * * 1" }]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - id: index
        uses: ExaDev/repo-index@v1
        with:
          output-paths: README.md
      - if: steps.index.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "docs: refresh repository index"
          git push
```

To preview the result without writing anything, set `dry-run: true`: the index is printed in the job log. The push step fails on a branch that requires pull requests; push to a branch and open one instead in that case.

To include private repositories as well, add a credential (see [Credentials](#credentials)) and set `visibility: all`:

```yaml
- uses: ExaDev/repo-index@v1
  with:
    output-paths: README.md
    visibility: all
    private-repos: include
    app-id: ${{ secrets.REPO_INDEX_APP_ID }}
    app-private-key: ${{ secrets.REPO_INDEX_APP_KEY }}
```

## Credentials

Exactly one of these, and the owner is read with metadata access only.

- **Nothing.** The workflow's own token is used. It sees public repositories only, which is all a public profile README needs.
- **`token`**: a fine-grained personal access token with read-only Metadata and Contents on the owner's repositories.
- **`app-id` and `app-private-key`**: a GitHub App with read-only Metadata and Contents, installed on the owner. An installation token is minted for `owner`. Create the App under Settings, Developer settings, GitHub Apps (see [GitHub's guide](https://docs.github.com/en/apps/creating-github-apps)), install it on the owner, and store its id and private key as repository secrets.

## Public output

A public file must never name a private repository, since the name alone discloses the project. By default only public repositories are fetched. To include private ones, set `visibility: all` and choose what to do with them with `private-repos`:

| Value     | Effect                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `exclude` | Private repositories are left out (default).                                     |
| `count`   | They add to a total, "And N private repositories", and are never named.          |
| `include` | They are named. The run fails unless the repository being written to is private. |

The check applies to the final selection, so an `include` rule cannot name a private repository in a public target either.

## Inputs

| Input                                   | Default                                   | Meaning                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owner`                                 | the workflow's repository owner           | User or organisation to index.                                                                                                                                                                                                                                                                                     |
| `output-paths`                          | required                                  | Files to write, one per line. Paths resolving to the same file, such as a symlink and its target, are written once; separate files each get the same content. A dangling symlink fails the run.                                                                                                                    |
| `marker`                                | `repo-index`                              | Name used in the start and end comments, so one file can hold more than one region.                                                                                                                                                                                                                                |
| `visibility`                            | `public`                                  | `public` or `all`.                                                                                                                                                                                                                                                                                                 |
| `private-repos`                         | `exclude`                                 | `exclude`, `count` or `include`.                                                                                                                                                                                                                                                                                   |
| `include-archived`, `include-forks`     | `false`                                   | Include archived repositories or forks.                                                                                                                                                                                                                                                                            |
| `rules`                                 | none                                      | Ordered `include`, `count` or `exclude` rules as YAML, inline or a path. The first match wins.                                                                                                                                                                                                                     |
| `format`                                | `table`                                   | `table` or `list`.                                                                                                                                                                                                                                                                                                 |
| `columns`                               | `name, description, languages, related`   | Any of `name`, `description`, `languages`, `related`, `stars`, `updated`, `visibility`.                                                                                                                                                                                                                            |
| `relations`                             | `depends-on, fork-of, template, mentions` | Which relationships the `related` column shows, or `none`.                                                                                                                                                                                                                                                         |
| `relations-limit`                       | `6`                                       | Most repositories listed per kind of relationship before `+N`.                                                                                                                                                                                                                                                     |
| `leak-policy`                           | `fail`                                    | What to do when a public repository refers to a private one: `fail`, `warn` or `off`.                                                                                                                                                                                                                              |
| `sort`                                  | `activity`                                | `activity`, `name`, `updated` or `stars`. `activity` ranks by recent commits on the default branch, with each commit's weight halving every `activity-half-life` days, so busy repositories come first and the list tails off as work goes quiet. Groups that are not named topic groups are ordered the same way. |
| `activity-half-life`                    | `30`                                      | Days over which a commit's weight halves when sorting by activity.                                                                                                                                                                                                                                                 |
| `group-by`                              | `topic`                                   | `topic`, `language` or `none`.                                                                                                                                                                                                                                                                                     |
| `ungrouped-label`                       | `Ungrouped`                               | Heading for repositories in no group.                                                                                                                                                                                                                                                                              |
| `topic-aliases`                         | none                                      | YAML map of variant topic to canonical topic, applied first and case-insensitively.                                                                                                                                                                                                                                |
| `ignore-topics`                         | none                                      | Topics left out of grouping.                                                                                                                                                                                                                                                                                       |
| `topic-groups`                          | none                                      | YAML map of heading to the topics it merges. A repository goes in the first group any of its topics matches.                                                                                                                                                                                                       |
| `multi-group`                           | `false`                                   | List a repository under every matching group instead.                                                                                                                                                                                                                                                              |
| `topic-priority`                        | none                                      | Topics preferred as a heading when a repository matches no group. Otherwise its alphabetically first topic is used, since GitHub topics are unordered.                                                                                                                                                             |
| `language-limit`                        | `5`                                       | Most languages listed per repository.                                                                                                                                                                                                                                                                              |
| `min-language-share`                    | `5`                                       | Minimum percentage of a repository's bytes for a language to be listed.                                                                                                                                                                                                                                            |
| `ignored-languages`, `language-aliases` | none                                      | Languages never listed, and a map of language to displayed name.                                                                                                                                                                                                                                                   |
| `require`                               | `description, topics`                     | Metadata every listed repository should have. Each one lacking it produces a warning.                                                                                                                                                                                                                              |
| `fail-on-missing`                       | `false`                                   | Fail the run when a listed repository lacks required metadata.                                                                                                                                                                                                                                                     |
| `dry-run`                               | `false`                                   | Print the generated index and write nothing.                                                                                                                                                                                                                                                                       |

Outputs: `changed`, `repos`, `missing-description` and `missing-topics`.

### Rules

```yaml
rules: |
  - match: "acme/tmp-*"
    action: exclude
  - match: { visibility: private, topic: client }
    action: count
  - match: /-archive$/
    action: exclude
```

A string `match` is a glob over `owner/repo` (`*` within a segment, `**` across segments; without a slash it matches the repository name) or a `/regex/`. A map `match` combines `visibility`, `org`, `topic` and `lang`, all of which must hold.

### Topic groups

```yaml
topic-aliases: |
  js: javascript
  k8s: kubernetes
ignore-topics: hacktoberfest
topic-groups: |
  Infrastructure: [kubernetes, terraform]
  Web: [react, nextjs]
```

A topic named in `topic-aliases`, `ignore-topics` or `topic-groups` that no listed repository carries produces a warning, so a typo does not silently match nothing.

## Relationships

The `related` column links each listed repository to the others it is connected to, from both ends:

- **Depends on** and **Used by**: GitHub's dependency graph (`package.json`, `Cargo.toml`, workflow `uses:` and the like), resolved to repositories. Lock files are skipped, since they record transitive dependencies rather than deliberate ones.
- **Fork of** and **Forks**, **From template** and **Template for**: the repository's fork parent and template.
- **See also**: the README names another listed repository as `owner/name` or by a github.com URL. A bare repository name is never a reference.

A relationship is drawn only when both repositories are listed in the same index. A repository that is excluded, counted without a name, archived or a fork left out never appears as an endpoint, so an index written to a public repository, which lists only public repositories, cannot show a link to a private one. An index written to a private repository with `private-repos: include` shows every relationship between all its listed repositories. Relationships to repositories of another owner are not drawn, because that owner's repositories are not in the index.

## Private references

A public repository must never refer to a private one. When the credential can see private repositories (`visibility: all`), the action also checks every public repository's description, topics, README, dependencies, fork parent and template for a private repository's `owner/name`, and by default (`leak-policy: fail`) stops the run before anything is written. Use `warn` to annotate instead, or `off` to skip the check. A run that cannot see private repositories finds nothing here, which proves nothing about the repositories it could not see, so the weekly workflows that guard an index run with a credential that can.

## Missing metadata

Every listed repository without a description or without topics gets a warning annotation and a row in the job summary. Rows without a description show `(no description)` in the index too.

## Next steps

Start with [Inputs](#inputs) to choose columns and grouping, then [Rules](#rules) and [Topic groups](#topic-groups) to shape the list. Read [Public output](#public-output) before pointing the action at a public README.

## Help

Open an issue at https://github.com/ExaDev/repo-index/issues with the workflow step and the run's log.

## Development

Source is plain TypeScript run directly by Node's type stripping, so there is no build step. It needs Node 26 or later.

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
```
