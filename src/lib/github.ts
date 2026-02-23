import { GitHubIssue } from "@/lib/types";

export class GitHubRateLimitError extends Error {
  remaining: number;
  resetAt: Date;

  constructor(remaining: number, resetTimestamp: number) {
    const resetAt = new Date(resetTimestamp * 1000);
    super(
      `GitHub API rate limit exceeded. Remaining: ${remaining}. Resets at ${resetAt.toISOString()}.`
    );
    this.name = "GitHubRateLimitError";
    this.remaining = remaining;
    this.resetAt = resetAt;
  }
}

export async function fetchIssues(repo: string): Promise<GitHubIssue[]> {
  const token = process.env.GITHUB_TOKEN;

  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=open&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  // Check rate limit headers
  const remaining = parseInt(
    response.headers.get("X-RateLimit-Remaining") ?? "-1",
    10
  );
  const resetTimestamp = parseInt(
    response.headers.get("X-RateLimit-Reset") ?? "0",
    10
  );

  if (response.status === 403 && remaining === 0) {
    throw new GitHubRateLimitError(remaining, resetTimestamp);
  }

  if (response.status === 403) {
    const body = await response.text();
    throw new Error(
      `GitHub API forbidden (403): ${body}. You may need to set GITHUB_TOKEN.`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${body}`
    );
  }

  const data: Array<GitHubIssue & { pull_request?: unknown }> =
    await response.json();

  // GitHub's issues endpoint also returns PRs — filter them out
  return data.filter((item) => item.pull_request === undefined);
}
