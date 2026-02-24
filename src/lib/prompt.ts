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

After completing your analysis, update structured output with a JSON object containing these fields:

- **issue_number** (integer, required): always ${issue.number}
- **confidence_score** (integer 1-10, required): your score based on the rubric above
- **estimated_effort** (string, required): one of "small", "medium", or "large"
- **summary** (string, required): a paragraph describing what needs to change and why
- **affected_files** (array, required): each entry is \`{"path": "the/real/file.ts", "reason": "why it needs changes"}\`
- **action_plan** (array, required): each entry is \`{"step": 1, "description": "specific actionable instruction", "risk": "low"}\` — risk is "low", "medium", or "high"
- **blockers** (string): any blockers you identified, or "" if none
- **questions** (string): any clarifying questions, or "" if none
- **status** (string, required): set to "scoped" when your analysis is complete, or "needs_clarification" if the issue is too ambiguous

Do NOT update structured output until you have actually completed the analysis. A confidence_score of 0 means the analysis was not done. You must clone the repo, explore the code, and form your own conclusions before writing structured output.

CRITICAL: Write structured output using the structured output feature (not to a file). If you do not set structured output, your analysis will be lost.
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
  "current_step": "Cloning repo and creating branch",
  "completed_steps": 0,
  "test_results": "no_tests",
  "pr_url": null,
  "notes": ""
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
