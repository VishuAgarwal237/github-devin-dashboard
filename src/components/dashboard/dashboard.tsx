"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IssueCard } from "@/components/dashboard/issue-card";
import { GitHubIssue } from "@/lib/types";

export function Dashboard() {
  const [repo, setRepo] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_REPO ?? ""
  );
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadIssues = useCallback(async () => {
    if (!repo.trim()) return;
    setLoading(true);
    setError(null);
    setLoaded(false);

    try {
      const res = await fetch(
        `/api/issues?repo=${encodeURIComponent(repo.trim())}`
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const data: GitHubIssue[] = await res.json();
      setIssues(data);
      setLoaded(true);
    } catch {
      setError("Network error fetching issues");
    } finally {
      setLoading(false);
    }
  }, [repo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") loadIssues();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight">
            GitHub Devin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scope and execute GitHub issues with Devin AI
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* Repo input */}
        <div className="flex gap-3 items-center">
          <Input
            type="text"
            placeholder="owner/repo (e.g. vercel/next.js)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-w-sm"
          />
          <Button onClick={loadIssues} disabled={loading || !repo.trim()}>
            {loading ? "Loading..." : "Load Issues"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-36" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Issues grid */}
        {!loading && loaded && issues.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No open issues found for <span className="font-medium">{repo}</span>.
          </p>
        )}

        {!loading && issues.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {issues.map((issue) => (
              <IssueCard key={issue.number} issue={issue} repo={repo} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
