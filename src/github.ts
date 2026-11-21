import * as z from "zod";
import type { Repo } from "./types.ts";

const QUERY = `
  query ($login: String!, $after: String, $privacy: RepositoryPrivacy) {
    repositoryOwner(login: $login) {
      repositories(first: 100, after: $after, privacy: $privacy, ownerAffiliations: OWNER, orderBy: { field: NAME, direction: ASC }) {
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
        }
      }
    }
  }
`;

const RepoNode = z.object({
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
): Promise<Repo[]> {
  const repos: Repo[] = [];
  let after: string | null = null;
  for (;;) {
    const page = Page.parse(
      await post(token, { query: QUERY, variables: { login, after, privacy } }),
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
