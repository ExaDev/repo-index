import * as z from "zod";
import { MS_PER_DAY, WINDOW_DAYS } from "./activity.ts";
import type { Repo } from "./types.ts";

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

async function post(token: string, body: unknown): Promise<unknown> {
  const url =
    process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
