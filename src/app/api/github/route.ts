import { NextResponse } from "next/server"

// TODO: Implement Next.js API route handler for proxying GitHub API requests
// (e.g., GET handler that fetches repo data server-side to keep tokens secure)

export async function GET() {
  return NextResponse.json({ message: "GitHub API route placeholder" })
}
