import { NextRequest, NextResponse } from "next/server";
import { GitHubIssue } from "@/lib/types";
import { buildScopingPrompt } from "@/lib/prompt";
import { createSession } from "@/lib/devin";

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issue, repo } = body as { issue: GitHubIssue; repo: string };

    if (!issue?.number || !repo || !REPO_REGEX.test(repo)) {
      return NextResponse.json(
        { error: "Invalid request. Required: issue (with number) and repo (owner/repo)." },
        { status: 400 }
      );
    }

    const prompt = buildScopingPrompt(issue, `https://github.com/${repo}`);

    const rawTitle = `Scope: #${issue.number} — ${issue.title}`;
    const title = rawTitle.length > 80 ? rawTitle.slice(0, 80) : rawTitle;

    const result = await createSession({
      prompt,
      title,
      tags: ["github-issues", "scope", repo, `issue-${issue.number}`],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
