import { NextRequest, NextResponse } from "next/server";
import { GitHubIssue, ScopingOutput } from "@/lib/types";
import { buildExecutionPrompt } from "@/lib/prompt";
import { createSession } from "@/lib/devin";

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issue, repo, actionPlan } = body as {
      issue: GitHubIssue;
      repo: string;
      actionPlan: ScopingOutput["action_plan"];
    };

    if (!issue?.number || !repo || !REPO_REGEX.test(repo)) {
      return NextResponse.json(
        { error: "Invalid request. Required: issue (with number) and repo (owner/repo)." },
        { status: 400 }
      );
    }

    if (!Array.isArray(actionPlan) || actionPlan.length === 0) {
      return NextResponse.json(
        { error: "actionPlan must be a non-empty array." },
        { status: 400 }
      );
    }

    const prompt = buildExecutionPrompt(
      issue,
      `https://github.com/${repo}`,
      actionPlan
    );

    const rawTitle = `Fix: #${issue.number} — ${issue.title}`;
    const title = rawTitle.length > 80 ? rawTitle.slice(0, 80) : rawTitle;

    const result = await createSession({
      prompt,
      title,
      tags: ["github-issues", "execute", repo, `issue-${issue.number}`],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
