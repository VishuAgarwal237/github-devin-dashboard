# GitHub Devin Dashboard

A Next.js 14 dashboard that integrates GitHub issues with [Devin AI](https://devin.ai) for automated scoping and execution of fixes.

## Live Demo

**https://github-devin-dashboard.vercel.app**

## How It Works

### Scope-Then-Execute Workflow

1. **Load Issues** — Enter a GitHub repo (`owner/repo`) and fetch its open issues.
2. **Scope with Devin** — Click "Scope with Devin" on any issue. This creates a Devin session that:
   - Clones the repo and explores the codebase
   - Identifies affected files and assesses complexity
   - Produces a step-by-step action plan with risk ratings
   - Assigns a confidence score (1-10)
   - **Does NOT make any code changes** — analysis only
3. **Review the Plan** — The dashboard displays the confidence score (color-coded green/yellow/red), action plan, affected files, and any blockers.
4. **Execute the Plan** — Click "Execute This Plan" to create a second Devin session that:
   - Follows the approved action plan step by step
   - Creates a branch, implements changes, runs tests
   - Opens a pull request targeting the default branch
5. **Get the PR** — When execution completes, a direct link to the PR appears in the dashboard.

Both scoping and execution sessions are polled every 15 seconds. Sessions running longer than 30 minutes show a "may be stalled" warning.

## Architecture

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Inter font, Toaster)
│   ├── page.tsx                # Entry point -> Dashboard component
│   └── api/
│       ├── issues/route.ts     # GET  /api/issues?repo=owner/repo
│       └── devin/
│           ├── scope/route.ts  # POST /api/devin/scope
│           ├── execute/route.ts# POST /api/devin/execute
│           └── status/[sessionId]/route.ts  # GET /api/devin/status/:id
├── components/
│   ├── dashboard/
│   │   ├── dashboard.tsx       # Main dashboard (repo input, issue grid)
│   │   └── issue-card.tsx      # Issue card with scoping + execution flows
│   └── ui/                     # shadcn/ui primitives (button, card, badge, etc.)
├── hooks/
│   └── use-toast.ts            # Toast hook for notifications
└── lib/
    ├── types.ts                # TypeScript interfaces (GitHubIssue, ScopingOutput, etc.)
    ├── github.ts               # GitHub API client (with rate limit detection)
    ├── devin.ts                # Devin API client (createSession, getSession, sendMessage)
    └── prompt.ts               # Prompt templates for scoping and execution sessions
```

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/issues?repo=owner/repo` | GET | Fetch open issues (filters out PRs) |
| `/api/devin/scope` | POST | Create a scoping session for an issue |
| `/api/devin/execute` | POST | Create an execution session with an approved plan |
| `/api/devin/status/:sessionId` | GET | Poll session status and structured output |

### Key Design Decisions

- **Server-side API keys** — `GITHUB_TOKEN` and `DEVIN_API_KEY` are only used in API routes, never exposed to the client.
- **Safe structured_output parsing** — The Devin API can return `null`, a JSON string, or an object. All three cases are handled without crashing.
- **Rate limit detection** — The GitHub client reads `X-RateLimit-Remaining` and throws a clear error on 403 instead of failing silently.
- **Duplicate session prevention** — Clicking "Scope with Devin" while a session is already running shows a toast instead of creating a duplicate.
- **Body truncation** — Issue bodies over 8,000 characters are truncated before being sent to Devin to avoid prompt size issues.
- **Stall detection** — Sessions polling for more than 30 minutes display a yellow warning.

## Setup

### Prerequisites

- Node.js 18+
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (for higher rate limits)
- A [Devin API Key](https://app.devin.ai/settings) (for creating sessions)

### Installation

```bash
git clone https://github.com/VishuAgarwal237/github-devin-dashboard.git
cd github-devin-dashboard
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
GITHUB_TOKEN=ghp_your_github_token
DEVIN_API_KEY=your_devin_api_key

# Optional: pre-fill the repo input
NEXT_PUBLIC_DEFAULT_REPO=owner/repo
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS + shadcn/ui
- **Font:** Inter via `next/font/google`
- **APIs:** GitHub REST API, Devin REST API
