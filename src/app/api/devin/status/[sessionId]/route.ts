import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/devin";
import { ScopingOutput, ExecutionOutput } from "@/lib/types";

/**
 * Safely parse structured_output which can be null, a JSON string, or an object.
 * Returns a typed object or null — never throws.
 */
function parseStructuredOutput(
  raw: unknown
): ScopingOutput | ExecutionOutput | null {
  if (raw === null || raw === undefined) return null;

  // If it's already an object, return as-is
  if (typeof raw === "object") return raw as ScopingOutput | ExecutionOutput;

  // If it's a string, try to JSON.parse it
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as ScopingOutput | ExecutionOutput;
      }
    } catch {
      // Not valid JSON — return null
    }
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  try {
    const session = await getSession(sessionId);

    return NextResponse.json({
      status: session.status_enum,
      structured_output: parseStructuredOutput(session.structured_output),
      pull_request: session.pull_request,
      url: session.url,
      title: session.title,
      created_at: session.created_at,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    if (message.includes("404")) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
