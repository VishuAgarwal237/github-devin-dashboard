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
  const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=30`;

  console.log(`[GitHub] GET ${url}`);
  console.log(`[GitHub] Auth: ${token ? "Bearer ***" + token.slice(-4) : "none"}`);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github.v3+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Check rate limit headers
  const remaining = parseInt(
    response.headers.get("X-RateLimit-Remaining") ?? "-1",
    10
  );
  const resetTimestamp = parseInt(
    response.headers.get("X-RateLimit-Reset") ?? "0",
    10
  );

  console.log(`[GitHub] Response: ${response.status} ${response.statusText}`);
  console.log(`[GitHub] Rate limit remaining: ${remaining}, resets: ${resetTimestamp ? new Date(resetTimestamp * 1000).toISOString() : "unknown"}`);

  if (response.status === 403 && remaining === 0) {
    throw new GitHubRateLimitError(remaining, resetTimestamp);
  }

  if (response.status === 403) {
    const body = await response.text();
    console.error(`[GitHub] 403 Forbidden: ${body}`);
    throw new Error(
      `GitHub API forbidden (403): ${body}. You may need to set GITHUB_TOKEN.`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`[GitHub] Error ${response.status}: ${body}`);
    throw new Error(
      `GitHub API error (${response.status}): ${body}`
    );
  }

  const data: Array<GitHubIssue & { pull_request?: unknown }> =
    await response.json();

  const issues = data.filter((item) => item.pull_request === undefined);
  console.log(`[GitHub] Fetched ${data.length} items, ${issues.length} issues (filtered ${data.length - issues.length} PRs)`);

  return issues;
}
