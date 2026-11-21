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
          app-id: ${{ secrets.REPO_INDEX_APP_ID }}
          app-private-key: ${{ secrets.REPO_INDEX_APP_KEY }}
      - if: steps.index.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "docs: refresh repository index"
          git push
```

## Credentials

Exactly one of these, and the owner is read with metadata access only.

- **Nothing.** The workflow's own token is used. It sees public repositories only, which is all a public profile README needs.
- **`token`**: a fine-grained personal access token with read-only Metadata on the owner's repositories.
- **`app-id` and `app-private-key`**: a GitHub App with read-only Metadata, installed on the owner. An installation token is minted for `owner`.

## Public output

A public file must never name a private repository, since the name alone discloses the project. By default only public repositories are fetched. To include private ones, set `visibility: all` and choose what to do with them with `private-repos`:

| Value     | Effect                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `exclude` | Private repositories are left out (default).                                     |
| `count`   | They add to a total, "And N private repositories", and are never named.          |
| `include` | They are named. The run fails unless the repository being written to is private. |

The check applies to the final selection, so an `include` rule cannot name a private repository in a public target either.

## Inputs

| Input                                   | Default                         | Meaning                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`                                 | the workflow's repository owner | User or organisation to index.                                                                                                                                                                  |
| `output-paths`                          | required                        | Files to write, one per line. Paths resolving to the same file, such as a symlink and its target, are written once; separate files each get the same content. A dangling symlink fails the run. |
| `marker`                                | `repo-index`                    | Name used in the start and end comments, so one file can hold more than one region.                                                                                                             |
| `visibility`                            | `public`                        | `public` or `all`.                                                                                                                                                                              |
| `private-repos`                         | `exclude`                       | `exclude`, `count` or `include`.                                                                                                                                                                |
| `include-archived`, `include-forks`     | `false`                         | Include archived repositories or forks.                                                                                                                                                         |
| `rules`                                 | none                            | Ordered `include`, `count` or `exclude` rules as YAML, inline or a path. The first match wins.                                                                                                  |
| `format`                                | `table`                         | `table` or `list`.                                                                                                                                                                              |
| `columns`                               | `name, description, languages`  | Any of `name`, `description`, `languages`, `stars`, `updated`, `visibility`.                                                                                                                    |
| `sort`                                  | `name`                          | `name`, `updated` or `stars`.                                                                                                                                                                   |
| `group-by`                              | `topic`                         | `topic`, `language` or `none`.                                                                                                                                                                  |
| `ungrouped-label`                       | `Ungrouped`                     | Heading for repositories in no group.                                                                                                                                                           |
| `topic-aliases`                         | none                            | YAML map of variant topic to canonical topic, applied first and case-insensitively.                                                                                                             |
| `ignore-topics`                         | none                            | Topics left out of grouping.                                                                                                                                                                    |
| `topic-groups`                          | none                            | YAML map of heading to the topics it merges. A repository goes in the first group any of its topics matches.                                                                                    |
| `multi-group`                           | `false`                         | List a repository under every matching group instead.                                                                                                                                           |
| `topic-priority`                        | none                            | Topics preferred as a heading when a repository matches no group. Otherwise its alphabetically first topic is used, since GitHub topics are unordered.                                          |
| `language-limit`                        | `5`                             | Most languages listed per repository.                                                                                                                                                           |
| `min-language-share`                    | `5`                             | Minimum percentage of a repository's bytes for a language to be listed.                                                                                                                         |
| `ignored-languages`, `language-aliases` | none                            | Languages never listed, and a map of language to displayed name.                                                                                                                                |
| `require`                               | `description, topics`           | Metadata every listed repository should have. Each one lacking it produces a warning.                                                                                                           |
| `fail-on-missing`                       | `false`                         | Fail the run when a listed repository lacks required metadata.                                                                                                                                  |
| `dry-run`                               | `false`                         | Print the generated index and write nothing.                                                                                                                                                    |

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

## Missing metadata

Every listed repository without a description or without topics gets a warning annotation and a row in the job summary. Rows without a description show `(no description)` in the index too.

## Next steps

Start with [Inputs](#inputs) to choose columns and grouping, then [Rules](#rules) and [Topic groups](#topic-groups) to shape the list. Read [Public output](#public-output) before pointing the action at a public README.

## Help

Open an issue at https://github.com/ExaDev/repo-index/issues with the workflow step and the run's log.

## Development

Source is plain TypeScript run directly by Node's type stripping, so there is no build step.

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
```
