import { GitHubIssue, ScopingOutput } from "@/lib/types";

export function buildScopingPrompt(
  issue: GitHubIssue,
  repoUrl: string
): string {
  const labelsStr =
    issue.labels.length > 0
      ? issue.labels.map((l) => l.name).join(", ")
      : "None";
  const MAX_BODY_LENGTH = 8000;
  const rawBody = issue.body ?? "No description provided.";
  const bodyStr =
    rawBody.length > MAX_BODY_LENGTH
      ? rawBody.slice(0, MAX_BODY_LENGTH) + "\n\n[... body truncated at 8,000 characters ...]"
      : rawBody;

  return `# Scoping Analysis for Issue #${issue.number}

## Context

You are analyzing a GitHub issue in the repository **${repoUrl}**.

- **Issue Number:** #${issue.number}
- **Title:** ${issue.title}
- **Labels:** ${labelsStr}
- **Body:**

${bodyStr}

---

## Task

Perform a thorough analysis of this issue **without making any code changes**.

### Steps

1. **Read and understand the issue.** Make sure you fully grasp what is being asked, including any edge cases or constraints mentioned.
2. **Clone the repository** from ${repoUrl}.
3. **Explore the codebase.** Identify the files, functions, and modules that are relevant to this issue. Trace the code paths involved.
4. **Assess complexity.** Determine how many files need changes, whether there are existing tests covering the affected area, and what the blast radius of a fix would be.
5. **Write an action plan.** Produce a step-by-step plan that someone else could follow to implement the fix. Each step should be specific and actionable.
6. **Assign a confidence score** from 1 to 10 using the rubric below.

---

IMPORTANT: Do NOT make any code changes, create branches, or open PRs.
This session is for analysis only.

---

## Confidence Score Rubric

- **9-10:** Straightforward, clear requirements, well-tested code area
- **7-8:** Clear requirements, known path, some complexity
- **5-6:** Ambiguous requirements or multiple valid approaches
- **3-4:** Significant unknowns, touches fragile code
- **1-2:** Very vague, huge scope, or high-risk

---

## Structured Output

Update your structured output as you work through the analysis. Use the following JSON shape:

\`\`\`json
{
  "issue_number": ${issue.number},
  "confidence_score": 7,
  "estimated_effort": "medium",
  "summary": "Brief summary of what needs to change and why.",
  "affected_files": [
    { "path": "src/lib/example.ts", "reason": "Contains the function that needs to be updated" }
  ],
  "action_plan": [
    { "step": 1, "description": "Update the validation logic in parseInput()", "risk": "low" },
    { "step": 2, "description": "Add error handling for edge case X", "risk": "medium" }
  ],
  "blockers": "Any blockers preventing implementation, or empty string if none.",
  "questions": "Any clarifying questions for the issue author, or empty string if none.",
  "status": "scoping_in_progress"
}
\`\`\`

Set \`status\` to \`"scoping_in_progress"\` while you are working, \`"scoped"\` when your analysis is complete, or \`"needs_clarification"\` if the issue is too ambiguous to scope confidently.

---

CRITICAL: You MUST update your structured output JSON (not a file, the structured output field) before finishing. Do not write your analysis to a file — use the structured output feature. If you do not set structured output, your analysis will be lost. Update structured output multiple times as you progress: once at the start with status "scoping_in_progress", and once at the end with status "scoped" and all fields filled in.
`;
}

export function buildExecutionPrompt(
  issue: GitHubIssue,
  repoUrl: string,
  actionPlan: ScopingOutput["action_plan"]
): string {
  const labelsStr =
    issue.labels.length > 0
      ? issue.labels.map((l) => l.name).join(", ")
      : "None";
  const bodyStr = issue.body ?? "No description provided.";

  const planSteps = actionPlan
    .map((s) => `${s.step}. ${s.description} _(risk: ${s.risk})_`)
    .join("\n");

  return `# Implementation for Issue #${issue.number}

## Context

You are implementing a fix for a GitHub issue in the repository **${repoUrl}**.

- **Issue Number:** #${issue.number}
- **Title:** ${issue.title}
- **Labels:** ${labelsStr}
- **Body:**

${bodyStr}

---

## Approved Action Plan

The following plan was reviewed and approved. Follow these steps in order.

${planSteps}

---

## Implementation Steps

1. **Clone the repository** from ${repoUrl} and create a branch called \`devin/fix-issue-${issue.number}\`.
2. **Work through the action plan** step by step. Complete each step before moving to the next.
3. **Run tests after each step** if the project has a test framework. Look for \`"test"\`, \`"jest"\`, or \`"pytest"\` in \`package.json\`, \`pyproject.toml\`, or the repo root.
4. **Write tests for your changes** if a test framework is present. Cover the key behavior your changes introduce or modify.
5. **Commit after each logical step.** Reference #${issue.number} in every commit message (e.g., \`"Fix validation logic for #${issue.number}"\`).
6. **Open a pull request** targeting the default branch:
   - **Title:** \`Fix #${issue.number}: ${issue.title}\`
   - **Body:** Explain what changed and why. Link to the issue with \`Closes #${issue.number}\`.

---

## Validation Checklist

Before opening the PR, verify:

- [ ] All existing tests still pass
- [ ] New tests cover the changes (if a test framework is present)
- [ ] No unrelated files were modified
- [ ] Branch is up to date with the default branch

---

## Structured Output

Update your structured output after completing each step. Use the following JSON shape:

\`\`\`json
{
  "issue_number": ${issue.number},
  "status": "implementing",
  "current_step": "Working on step 1: cloning repo and creating branch",
  "completed_steps": 0,
  "test_results": "no_tests",
  "pr_url": null,
  "notes": "Any additional context about progress or issues encountered."
}
\`\`\`

Update \`status\` as you progress:
- \`"implementing"\` — actively working on the plan
- \`"testing"\` — running and writing tests
- \`"pr_created"\` — PR has been opened successfully
- \`"failed"\` — something went wrong that prevents completion

Update \`completed_steps\` after finishing each action plan step. Set \`pr_url\` once the PR is created. Use \`test_results\` to report \`"pass"\`, \`"fail"\`, or \`"no_tests"\`.
`;
}
