"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { GitHubIssue, ScopingOutput, ExecutionOutput } from "@/lib/types";

interface IssueCardProps {
  issue: GitHubIssue;
  repo: string;
}

type ScopingState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "polling"; sessionId: string; url: string; startedAt: number }
  | { phase: "done"; output: ScopingOutput; sessionUrl: string }
  | { phase: "error"; message: string };

type ExecutionState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "polling"; sessionId: string; url: string; startedAt: number }
  | { phase: "done"; output: ExecutionOutput; sessionUrl: string }
  | { phase: "error"; message: string };

const POLL_INTERVAL = 15000;
const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Safely normalize structured_output which may be null, a string, or an object.
 */
function normalizeOutput(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // Not valid JSON
    }
  }
  return null;
}

function parseScopingOutput(raw: unknown): ScopingOutput | null {
  const obj = normalizeOutput(raw);
  if (!obj) return null;

  // Accept the output if it looks like a scoping result.
  // Check for several possible fields — Devin may not fill every one.
  const hasScopingFields =
    "confidence_score" in obj ||
    "action_plan" in obj ||
    "summary" in obj ||
    "affected_files" in obj ||
    ("status" in obj &&
      typeof obj.status === "string" &&
      ["scoping_in_progress", "scoped", "needs_clarification"].includes(obj.status as string));

  if (hasScopingFields) {
    // Fill in safe defaults for any missing fields
    return {
      issue_number: (obj.issue_number as number) ?? 0,
      confidence_score: (obj.confidence_score as number) ?? 0,
      estimated_effort: (obj.estimated_effort as ScopingOutput["estimated_effort"]) ?? "medium",
      summary: (obj.summary as string) ?? "",
      affected_files: Array.isArray(obj.affected_files) ? obj.affected_files as ScopingOutput["affected_files"] : [],
      action_plan: Array.isArray(obj.action_plan) ? obj.action_plan as ScopingOutput["action_plan"] : [],
      blockers: (obj.blockers as string) ?? "",
      questions: (obj.questions as string) ?? "",
      status: (obj.status as ScopingOutput["status"]) ?? "scoping_in_progress",
    };
  }
  return null;
}

function parseExecutionOutput(raw: unknown): ExecutionOutput | null {
  const obj = normalizeOutput(raw);
  if (!obj) return null;

  // Accept if it looks like an execution result
  const hasExecutionFields =
    "pr_url" in obj ||
    "current_step" in obj ||
    "completed_steps" in obj ||
    ("status" in obj &&
      typeof obj.status === "string" &&
      ["implementing", "testing", "pr_created", "failed"].includes(obj.status as string));

  if (hasExecutionFields) {
    return {
      issue_number: (obj.issue_number as number) ?? 0,
      status: (obj.status as ExecutionOutput["status"]) ?? "implementing",
      current_step: (obj.current_step as string) ?? "",
      completed_steps: (obj.completed_steps as number) ?? 0,
      test_results: (obj.test_results as ExecutionOutput["test_results"]) ?? "no_tests",
      pr_url: (obj.pr_url as string) ?? null,
      notes: (obj.notes as string) ?? "",
    };
  }
  return null;
}

export function IssueCard({ issue, repo }: IssueCardProps) {
  const [scoping, setScoping] = useState<ScopingState>({ phase: "idle" });
  const [execution, setExecution] = useState<ExecutionState>({ phase: "idle" });
  const [stalledScoping, setStalledScoping] = useState(false);
  const [stalledExecution, setStalledExecution] = useState(false);
  const scopingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const executionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // Check for stalled sessions every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (scoping.phase === "polling") {
        setStalledScoping(Date.now() - scoping.startedAt > STALL_THRESHOLD_MS);
      }
      if (execution.phase === "polling") {
        setStalledExecution(Date.now() - execution.startedAt > STALL_THRESHOLD_MS);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [scoping, execution]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scopingTimerRef.current) clearInterval(scopingTimerRef.current);
      if (executionTimerRef.current) clearInterval(executionTimerRef.current);
    };
  }, []);

  const pollSession = useCallback(
    (
      sessionId: string,
      onUpdate: (data: {
        status: string;
        structured_output: unknown;
        url: string;
        created_at: string;
      }) => void,
      onError: (msg: string) => void
    ) => {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/devin/status/${sessionId}`);
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Unknown error" }));
            onError(err.error || "Failed to fetch session status");
            clearInterval(timer);
            return;
          }
          const data = await res.json();
          onUpdate(data);
          // Stop polling when session is no longer active.
          // "blocked" = Devin finished and is waiting for input (i.e. done for scoping).
          // "stopped" / "finished" / "expired" are also terminal.
          const terminalStatuses = ["blocked", "stopped", "finished", "expired"];
          if (terminalStatuses.includes(data.status)) {
            clearInterval(timer);
          }
        } catch {
          onError("Network error while polling session");
          clearInterval(timer);
        }
      }, POLL_INTERVAL);
      return timer;
    },
    []
  );

  const handleScope = async () => {
    // Prevent duplicate scoping sessions
    if (scoping.phase === "loading" || scoping.phase === "polling") {
      toast({
        title: "Scoping already in progress",
        description: `A scoping session for issue #${issue.number} is already running.`,
        variant: "destructive",
      });
      return;
    }

    setScoping({ phase: "loading" });
    setStalledScoping(false);
    try {
      const res = await fetch("/api/devin/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, repo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to start scoping" }));
        setScoping({ phase: "error", message: err.error || "Failed to start scoping" });
        return;
      }
      const { session_id, url } = await res.json();
      const now = Date.now();
      setScoping({ phase: "polling", sessionId: session_id, url, startedAt: now });

      scopingTimerRef.current = pollSession(
        session_id,
        (data) => {
          const output = parseScopingOutput(data.structured_output);

          const sessionDone = ["blocked", "stopped", "finished", "expired"].includes(data.status);

          if (output) {
            // Show results when:
            // 1. Session reached a terminal state (blocked/stopped/finished/expired)
            // 2. OR structured_output.status is "scoped" / "needs_clarification"
            //    (Devin may write results while session is still "working")
            const scopingFinished =
              sessionDone ||
              output.status === "scoped" ||
              output.status === "needs_clarification";

            if (scopingFinished) {
              setScoping({ phase: "done", output, sessionUrl: data.url ?? url });
              if (scopingTimerRef.current) clearInterval(scopingTimerRef.current);
            }
          } else if (sessionDone) {
            // Session ended but no parseable structured output
            setScoping({ phase: "error", message: "Session ended without producing scoping results. Check the Devin session for details." });
            if (scopingTimerRef.current) clearInterval(scopingTimerRef.current);
          }
        },
        (msg) => setScoping({ phase: "error", message: msg })
      );
    } catch {
      setScoping({ phase: "error", message: "Network error" });
    }
  };

  const handleExecute = async () => {
    if (scoping.phase !== "done") return;

    // Prevent duplicate execution sessions
    if (execution.phase === "loading" || execution.phase === "polling") {
      toast({
        title: "Execution already in progress",
        description: `An execution session for issue #${issue.number} is already running.`,
        variant: "destructive",
      });
      return;
    }

    const actionPlan = scoping.output.action_plan;

    setExecution({ phase: "loading" });
    setStalledExecution(false);
    try {
      const res = await fetch("/api/devin/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, repo, actionPlan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to start execution" }));
        setExecution({ phase: "error", message: err.error || "Failed to start execution" });
        return;
      }
      const { session_id, url } = await res.json();
      const now = Date.now();
      setExecution({ phase: "polling", sessionId: session_id, url, startedAt: now });

      executionTimerRef.current = pollSession(
        session_id,
        (data) => {
          const output = parseExecutionOutput(data.structured_output);

          const sessionDone = ["blocked", "stopped", "finished", "expired"].includes(data.status);

          if (output) {
            // Show results when:
            // 1. Session reached a terminal state
            // 2. OR structured_output.status is "pr_created" / "failed"
            const executionFinished =
              sessionDone ||
              output.status === "pr_created" ||
              output.status === "failed";

            if (executionFinished) {
              setExecution({ phase: "done", output, sessionUrl: data.url ?? url });
              if (executionTimerRef.current) clearInterval(executionTimerRef.current);
            }
          } else if (sessionDone) {
            setExecution({ phase: "error", message: "Session ended without producing execution results. Check the Devin session for details." });
            if (executionTimerRef.current) clearInterval(executionTimerRef.current);
          }
        },
        (msg) => setExecution({ phase: "error", message: msg })
      );
    } catch {
      setExecution({ phase: "error", message: "Network error" });
    }
  };

  const confidenceColor = (score: number) => {
    if (score >= 7) return "text-green-600";
    if (score >= 5) return "text-yellow-600";
    return "text-red-600";
  };

  const confidenceBg = (score: number) => {
    if (score >= 7) return "bg-green-100 border-green-300";
    if (score >= 5) return "bg-yellow-100 border-yellow-300";
    return "bg-red-100 border-red-300";
  };

  const isScopingBusy = scoping.phase === "loading" || scoping.phase === "polling";
  const isExecutionBusy = execution.phase === "loading" || execution.phase === "polling";

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-snug">
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {issue.title}
              </a>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              #{issue.number}
            </p>
          </div>
          <Image
            src={issue.user.avatar_url}
            alt={issue.user.login}
            width={32}
            height={32}
            className="rounded-full shrink-0"
          />
        </div>
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {issue.labels.map((label) => (
              <Badge
                key={label.name}
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: `#${label.color}`,
                  color: `#${label.color}`,
                }}
              >
                {label.name}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Scoping results */}
        {scoping.phase === "done" && (
          <div className="space-y-3">
            <div
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${confidenceBg(scoping.output.confidence_score)}`}
            >
              <span>Confidence:</span>
              <span className={`font-bold ${confidenceColor(scoping.output.confidence_score)}`}>
                {scoping.output.confidence_score}/10
              </span>
              <span className="text-muted-foreground">
                ({scoping.output.estimated_effort})
              </span>
            </div>

            {scoping.output.summary && (
              <p className="text-sm text-muted-foreground">{scoping.output.summary}</p>
            )}

            {scoping.output.action_plan.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Action Plan</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  {scoping.output.action_plan.map((step) => (
                    <li key={step.step}>
                      {step.description}
                      <Badge variant="outline" className="ml-1.5 text-xs">
                        {step.risk}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {scoping.output.affected_files.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Affected Files</h4>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {scoping.output.affected_files.map((f) => (
                    <li key={f.path}>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {f.path}
                      </code>
                      <span className="ml-1.5">&mdash; {f.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {scoping.output.blockers &&
              scoping.output.blockers.trim() !== "" &&
              !scoping.output.blockers.includes("<any blockers") &&
              !scoping.output.blockers.includes("Any blockers preventing") &&
              !scoping.output.blockers.includes("empty string if none") && (
              <div>
                <h4 className="text-sm font-medium mb-1">Blockers</h4>
                <p className="text-sm text-red-600">{scoping.output.blockers}</p>
              </div>
            )}

            <a
              href={scoping.sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View Devin session
            </a>
          </div>
        )}

        {/* Execution results */}
        {execution.phase === "done" && (
          <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
            <h4 className="text-sm font-medium">Execution Complete</h4>
            <p className="text-sm text-muted-foreground">
              Status: <span className="font-medium">{execution.output.status}</span>
              {execution.output.test_results !== "no_tests" && (
                <> &middot; Tests: <span className="font-medium">{execution.output.test_results}</span></>
              )}
            </p>
            {execution.output.pr_url && (
              <a
                href={execution.output.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
              >
                View Pull Request
              </a>
            )}
            {execution.output.notes && (
              <p className="text-xs text-muted-foreground">{execution.output.notes}</p>
            )}
            <a
              href={execution.sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline block"
            >
              View Devin session
            </a>
          </div>
        )}

        {/* Scoping polling indicator */}
        {isScopingBusy && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <p className="text-xs text-muted-foreground">
              {scoping.phase === "loading" ? "Starting scoping session..." : "Scoping in progress... polling every 15s"}
            </p>
            {stalledScoping && (
              <p className="text-xs font-medium text-yellow-600">
                This session has been running for over 30 minutes and may be stalled.
              </p>
            )}
            {scoping.phase === "polling" && (
              <a
                href={scoping.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Watch live on Devin
              </a>
            )}
          </div>
        )}

        {/* Execution polling indicator */}
        {isExecutionBusy && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <p className="text-xs text-muted-foreground">
              {execution.phase === "loading" ? "Starting execution session..." : "Execution in progress... polling every 15s"}
            </p>
            {stalledExecution && (
              <p className="text-xs font-medium text-yellow-600">
                This session has been running for over 30 minutes and may be stalled.
              </p>
            )}
            {execution.phase === "polling" && (
              <a
                href={execution.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Watch live on Devin
              </a>
            )}
          </div>
        )}

        {/* Errors */}
        {scoping.phase === "error" && (
          <p className="text-sm text-red-600">Scoping error: {scoping.message}</p>
        )}
        {execution.phase === "error" && (
          <p className="text-sm text-red-600">Execution error: {execution.message}</p>
        )}
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          size="sm"
          onClick={handleScope}
          disabled={isScopingBusy || scoping.phase === "done"}
        >
          {scoping.phase === "loading"
            ? "Starting..."
            : scoping.phase === "polling"
              ? "Scoping..."
              : scoping.phase === "done"
                ? "Scoped"
                : "Scope with Devin"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExecute}
          disabled={scoping.phase !== "done" || isExecutionBusy || execution.phase === "done"}
        >
          {execution.phase === "loading"
            ? "Starting..."
            : execution.phase === "polling"
              ? "Executing..."
              : execution.phase === "done"
                ? "Executed"
                : "Execute This Plan"}
        </Button>
      </CardFooter>
    </Card>
  );
}
