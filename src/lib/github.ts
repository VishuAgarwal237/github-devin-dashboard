import { GitHubIssue } from "@/lib/types";

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
