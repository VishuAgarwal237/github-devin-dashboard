export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
}

export interface ScopingOutput {
  issue_number: number;
  confidence_score: number;
  estimated_effort: "small" | "medium" | "large";
  summary: string;
  affected_files: Array<{ path: string; reason: string }>;
  action_plan: Array<{
    step: number;
    description: string;
    risk: "low" | "medium" | "high";
  }>;
  blockers: string;
  questions: string;
  status: "scoping_in_progress" | "scoped" | "needs_clarification";
}

export interface ExecutionOutput {
  issue_number: number;
  status: "implementing" | "testing" | "pr_created" | "failed";
  current_step: string;
  completed_steps: number;
  test_results: "pass" | "fail" | "no_tests";
  pr_url: string | null;
  notes: string;
}

export interface DevinSession {
  session_id: string;
  status_enum: "working" | "blocked" | "stopped";
  structured_output: ScopingOutput | ExecutionOutput | null;
  url: string;
  title: string;
  pull_request: { url: string } | null;
  created_at: string;
  updated_at: string;
}

export interface IssueWithSession {
  issue: GitHubIssue;
  scopingSession: DevinSession | null;
  executionSession: DevinSession | null;
}
