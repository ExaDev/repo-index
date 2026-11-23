import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchRepos } from "./github.ts";

const BAD_GATEWAY = 502;
const ATTEMPTS = 4;
const realFetch = globalThis.fetch;
process.env.REPO_INDEX_RETRY_PAUSE_MS = "0";
afterEach(() => {
  globalThis.fetch = realFetch;
});

const EMPTY_PAGE = {
  data: {
    repositoryOwner: {
      repositories: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    },
  },
};

function respond(...bodies: readonly (object | number)[]): {
  calls: () => number;
} {
  let call = 0;
  globalThis.fetch = async (): Promise<Response> => {
    const next = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return Promise.resolve(
      typeof next === "number"
        ? new Response("", { status: next })
        : new Response(JSON.stringify(next), { status: 200 }),
    );
  };
  return { calls: () => call };
}

const transient = {
  errors: [
    {
      message: "Something went wrong while executing your query on 2026-01-01.",
    },
  ],
};

test("a transient GraphQL error is retried and the later page is used", async () => {
  const seen = respond(transient, EMPTY_PAGE);
  const repos = await fetchRepos("t", "acme", null, new Date());
  assert.deepEqual(repos, []);
  assert.equal(seen.calls(), 2);
});

test("a 502 is retried, then succeeds", async () => {
  const seen = respond(BAD_GATEWAY, EMPTY_PAGE);
  await fetchRepos("t", "acme", null, new Date());
  assert.equal(seen.calls(), 2);
});

test("a permanent GraphQL error is not retried", async () => {
  const seen = respond({
    errors: [{ message: "Could not resolve to a User" }],
  });
  await assert.rejects(
    async () => fetchRepos("t", "acme", null, new Date()),
    /returned errors/,
  );
  assert.equal(seen.calls(), 1);
});

test("a transient error that never clears fails after the attempts", async () => {
  const seen = respond(transient);
  await assert.rejects(
    async () => fetchRepos("t", "acme", null, new Date()),
    /returned errors/,
  );
  assert.equal(seen.calls(), ATTEMPTS);
});
