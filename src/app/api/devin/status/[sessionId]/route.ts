import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/devin";

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;

  try {
    const session = await getSession(sessionId);

    return NextResponse.json({
      status: session.status_enum,
      structured_output: session.structured_output,
      pull_request: session.pull_request,
      url: session.url,
      title: session.title,
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
