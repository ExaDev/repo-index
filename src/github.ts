import * as z from "zod";
import { MS_PER_DAY, WINDOW_DAYS } from "./activity.ts";
import { extractMentions } from "./relations.ts";
import type { SlugIndex } from "./relations.ts";
import type { RawRelations, Repo } from "./types.ts";

/** Repositories per page. Each carries four commit-history counts, so a full page of 100 was observed to time out with a 502; a smaller page keeps each request cheap. */
const PAGE_SIZE = 25;

const QUERY = `
  query ($login: String!, $first: Int!, $after: String, $privacy: RepositoryPrivacy, $since7: GitTimestamp!, $since30: GitTimestamp!, $since90: GitTimestamp!, $since365: GitTimestamp!) {
    repositoryOwner(login: $login) {
      repositories(first: $first, after: $after, privacy: $privacy, ownerAffiliations: OWNER, orderBy: { field: NAME, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name
          nameWithOwner
          url
          description
          isPrivate
          isArchived
          isFork
          stargazerCount
          pushedAt
          owner { login }
          primaryLanguage { name }
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
          repositoryTopics(first: 20) { nodes { topic { name } } }
          defaultBranchRef { target { ... on Commit { last7: history(since: $since7) { totalCount } last30: history(since: $since30) { totalCount } last90: history(since: $since90) { totalCount } last365: history(since: $since365) { totalCount } } } }
        }
      }
    }
  }
`;

const Count = z.object({ totalCount: z.number() });

const RepoNode = z.object({
  defaultBranchRef: z
    .object({
      target: z
        .object({
          last7: Count,
          last30: Count,
          last90: Count,
          last365: Count,
        })
        .partial()
        .nullable(),
    })
    .nullable(),
  name: z.string(),
  nameWithOwner: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  isArchived: z.boolean(),
  isFork: z.boolean(),
  stargazerCount: z.number(),
  pushedAt: z.string().nullable(),
  owner: z.object({ login: z.string() }),
  primaryLanguage: z.object({ name: z.string() }).nullable(),
  languages: z.object({
    edges: z.array(
      z.object({ size: z.number(), node: z.object({ name: z.string() }) }),
    ),
  }),
  repositoryTopics: z.object({
    nodes: z.array(z.object({ topic: z.object({ name: z.string() }) })),
  }),
});

const Page = z.object({
  data: z.object({
    repositoryOwner: z
      .object({
        repositories: z.object({
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
          nodes: z.array(RepoNode),
        }),
      })
      .nullable(),
  }),
});

export function toRepo(node: z.infer<typeof RepoNode>): Repo {
  const target = node.defaultBranchRef?.target;
  return {
    name: node.name,
    nameWithOwner: node.nameWithOwner,
    owner: node.owner.login,
    url: node.url,
    description:
      node.description === null || node.description.trim() === ""
        ? null
        : node.description.trim(),
    isPrivate: node.isPrivate,
    isArchived: node.isArchived,
    isFork: node.isFork,
    stars: node.stargazerCount,
    pushedAt: node.pushedAt,
    topics: node.repositoryTopics.nodes.map((n) => n.topic.name),
    primaryLanguage: node.primaryLanguage?.name ?? null,
    languages: node.languages.edges.map((e) => ({
      name: e.node.name,
      size: e.size,
    })),
    commits: {
      last7: target?.last7?.totalCount ?? 0,
      last30: target?.last30?.totalCount ?? 0,
      last90: target?.last90?.totalCount ?? 0,
      last365: target?.last365?.totalCount ?? 0,
    },
  };
}

/** Attempts per request, and the pause before a retry in milliseconds, which grows with each attempt. GitHub answers an expensive query with a 502 or 504 that a smaller or repeated request often clears. */
const ATTEMPTS = 3;
const RETRY_PAUSE_MS = 3000;
/** Status codes that a repeated request can clear: the server errors from 500 up to and including 504. */
const FIRST_SERVER_ERROR = 500;
const LAST_RETRYABLE_ERROR = 504;

async function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryable(response: Response): boolean {
  return (
    !response.ok &&
    response.status >= FIRST_SERVER_ERROR &&
    response.status <= LAST_RETRYABLE_ERROR
  );
}

async function post(token: string, body: unknown): Promise<unknown> {
  const url =
    process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql";
  const send = async (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  let response = await send();
  for (
    let attempt = 1;
    attempt < ATTEMPTS && isRetryable(response);
    attempt += 1
  ) {
    await pause(RETRY_PAUSE_MS * attempt);
    response = await send();
  }
  if (!response.ok) {
    throw new Error(
      `GitHub GraphQL request failed: ${String(response.status)} ${response.statusText}`,
    );
  }
  const json: unknown = await response.json();
  if (typeof json === "object" && json !== null && "errors" in json) {
    throw new Error(
      `GitHub GraphQL returned errors: ${JSON.stringify(json.errors)}`,
    );
  }
  return json;
}

/** Every repository the owner holds that the token can see, paginated, with the response validated. */
export async function fetchRepos(
  token: string,
  login: string,
  privacy: "PUBLIC" | null,
  now: Readonly<Date>,
): Promise<Repo[]> {
  const [since7, since30, since90, since365] = WINDOW_DAYS.map((days) =>
    new Date(now.getTime() - days * MS_PER_DAY).toISOString(),
  );
  const repos: Repo[] = [];
  let after: string | null = null;
  for (;;) {
    const page = Page.parse(
      await post(token, {
        query: QUERY,
        variables: {
          login,
          first: PAGE_SIZE,
          after,
          privacy,
          since7,
          since30,
          since90,
          since365,
        },
      }),
    );
    const owner = page.data.repositoryOwner;
    if (owner === null)
      throw new Error(`No user or organisation named "${login}".`);
    repos.push(...owner.repositories.nodes.map(toRepo));
    if (!owner.repositories.pageInfo.hasNextPage) return repos;
    after = owner.repositories.pageInfo.endCursor;
  }
}

/** Whether the repository that holds the output files is private, read from the API. */
export async function isRepositoryPrivate(
  token: string,
  nameWithOwner: string,
): Promise<boolean> {
  const url = `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${nameWithOwner}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Could not read visibility of ${nameWithOwner}: ${String(response.status)}`,
    );
  }
  const json = z.object({ private: z.boolean() }).parse(await response.json());
  return json.private;
}

/** Repositories per request for the cheap relationship fields (fork parent, template and README). */
const LINKS_BATCH = 8;

/** Dependency graph requests in flight at once. The dependency graph is the expensive part: one repository's takes seconds, and several in one request were observed to time out with a 502, so each is asked for alone. */
const DEPENDENCY_CONCURRENCY = 6;

/** Dependencies read per request. A manifest with more is read in several pages, so none is dropped. */
const DEPENDENCIES_PER_PAGE = 100;

/** Manifests listed per request, which only carries their ids and file names. */
const MANIFESTS_PER_PAGE = 100;

/** Lock files record every transitive dependency of a build, not the repositories this one deliberately uses, and are the largest manifests, so they are skipped. */
const LOCK_FILE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|gradle\.lockfile)$/;

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

const LinksNode = z
  .object({
    parent: z.object({ nameWithOwner: z.string() }).nullable(),
    templateRepository: z.object({ nameWithOwner: z.string() }).nullable(),
    readme: z.object({ text: z.string().nullable().optional() }).nullable(),
  })
  .nullable();

const ManifestsPage = z.object({
  data: z.object({
    repository: z
      .object({
        dependencyGraphManifests: z.object({
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
          nodes: z.array(z.object({ id: z.string(), filename: z.string() })),
        }),
      })
      .nullable(),
  }),
});

const DependenciesNode = z
  .object({
    dependencies: z.object({
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        endCursor: z.string().nullable(),
      }),
      nodes: z.array(
        z.object({
          repository: z.object({ nameWithOwner: z.string() }).nullable(),
        }),
      ),
    }),
  })
  .nullable();

/** Manifests whose dependencies are read in one request. */
const MANIFESTS_PER_REQUEST = 4;

function parts(nameWithOwner: string): { owner: string; name: string } {
  const [owner = "", name = ""] = nameWithOwner.split("/");
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(name)) {
    throw new Error(`Unexpected repository name: ${nameWithOwner}`);
  }
  return { owner, name };
}

/** Runs `task` over `items` with at most `limit` in flight, returning results in input order. */
async function pool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await task(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function fetchLinks(
  token: string,
  batch: readonly Repo[],
): Promise<z.infer<typeof LinksNode>[]> {
  const fields = batch.map((repo, index) => {
    const { owner, name } = parts(repo.nameWithOwner);
    return `r${String(index)}: repository(owner: "${owner}", name: "${name}") { parent { nameWithOwner } templateRepository { nameWithOwner } readme: object(expression: "HEAD:README.md") { ... on Blob { text } } }`;
  });
  const json = z
    .object({ data: z.record(z.string(), LinksNode) })
    .parse(await post(token, { query: `query { ${fields.join(" ")} }` }));
  return batch.map((repo, index) => {
    const node = json.data[`r${String(index)}`];
    if (node === undefined) {
      throw new Error(`GitHub returned nothing for ${repo.nameWithOwner}.`);
    }
    return node;
  });
}

/** The repositories one repository's dependency graph resolves to, read manifest by manifest because one request for all of them times out on a large repository. */
async function fetchDependencies(token: string, repo: Repo): Promise<string[]> {
  const { owner, name } = parts(repo.nameWithOwner);
  const manifests: { id: string; filename: string }[] = [];
  let manifestCursor: string | null = null;
  for (;;) {
    const after: string =
      manifestCursor === null ? "" : `, after: "${manifestCursor}"`;
    const page = ManifestsPage.parse(
      await post(token, {
        query: `query { repository(owner: "${owner}", name: "${name}") { dependencyGraphManifests(first: ${String(MANIFESTS_PER_PAGE)}${after}) { pageInfo { hasNextPage endCursor } nodes { id filename } } } }`,
      }),
    ).data.repository?.dependencyGraphManifests;
    if (page === undefined) break;
    manifests.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    manifestCursor = page.pageInfo.endCursor;
  }
  const found = new Set<string>();
  let queue: { id: string; cursor: string | null }[] = manifests
    .filter((m) => !LOCK_FILE.test(m.filename))
    .map((m) => ({ id: m.id, cursor: null }));
  while (queue.length > 0) {
    const chunk = queue.slice(0, MANIFESTS_PER_REQUEST);
    const rest = queue.slice(MANIFESTS_PER_REQUEST);
    const fields = chunk.map((m, index) => {
      const after = m.cursor === null ? "" : `, after: "${m.cursor}"`;
      return `m${String(index)}: node(id: "${m.id}") { ... on DependencyGraphManifest { dependencies(first: ${String(DEPENDENCIES_PER_PAGE)}${after}) { pageInfo { hasNextPage endCursor } nodes { repository { nameWithOwner } } } } }`;
    });
    const json = z
      .object({ data: z.record(z.string(), DependenciesNode) })
      .parse(await post(token, { query: `query { ${fields.join(" ")} }` }));
    const more: { id: string; cursor: string | null }[] = [];
    chunk.forEach((m, index) => {
      const dependencies = json.data[`m${String(index)}`]?.dependencies;
      if (dependencies === undefined) return;
      for (const dependency of dependencies.nodes) {
        if (dependency.repository !== null) {
          found.add(dependency.repository.nameWithOwner);
        }
      }
      if (dependencies.pageInfo.hasNextPage) {
        more.push({ id: m.id, cursor: dependencies.pageInfo.endCursor });
      }
    });
    queue = [...rest, ...more];
  }
  return [...found];
}

/**
 * What GitHub reports about each repository's links to other repositories: its fork parent, its template, the repositories its dependency graph resolves to, and the known repositories its README names as `owner/name` or by URL. `known` is every fetched repository, so a README naming a private one is recognised (and can be reported) even when that repository is not going to be listed.
 */
export async function fetchRelations(
  token: string,
  repos: readonly Repo[],
  known: SlugIndex,
): Promise<Map<string, RawRelations>> {
  const batches: Repo[][] = [];
  for (let start = 0; start < repos.length; start += LINKS_BATCH) {
    batches.push(repos.slice(start, start + LINKS_BATCH));
  }
  const links = (
    await pool(batches, 2, async (batch) => fetchLinks(token, batch))
  ).flat();
  const dependencies = await pool(repos, DEPENDENCY_CONCURRENCY, async (repo) =>
    fetchDependencies(token, repo),
  );
  const out = new Map<string, RawRelations>();
  repos.forEach((repo, index) => {
    const node = links[index];
    out.set(repo.nameWithOwner, {
      parent: node?.parent?.nameWithOwner ?? null,
      template: node?.templateRepository?.nameWithOwner ?? null,
      dependencies: dependencies[index] ?? [],
      mentions: extractMentions(
        node?.readme?.text ?? "",
        known,
        repo.nameWithOwner,
      ),
    });
  });
  return out;
}
