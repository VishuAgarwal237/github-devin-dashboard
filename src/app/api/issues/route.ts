import { NextRequest, NextResponse } from "next/server";
import { fetchIssues } from "@/lib/github";

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("repo");

  if (!repo || !REPO_REGEX.test(repo)) {
    return NextResponse.json(
      { error: "Invalid repo format. Expected: owner/repo" },
      { status: 400 }
    );
  }

  try {
    const issues = await fetchIssues(repo);
    return NextResponse.json(issues);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
