import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/devin";
import { ScopingOutput, ExecutionOutput, SessionMessage } from "@/lib/types";

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

/**
 * Attempt to extract a JSON object matching ScopingOutput or ExecutionOutput
 * from the session messages. Devin sometimes writes the analysis as a JSON
 * block in a message instead of (or in addition to) setting structured_output.
 * We scan messages in reverse order (newest first) looking for a JSON object
 * that has at least one recognisable scoping/execution field.
 */
function extractOutputFromMessages(
  messages: SessionMessage[]
): ScopingOutput | ExecutionOutput | null {
  // Walk newest → oldest so we find the most recent result first
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].message;
    if (!text) continue;

    // Try to find JSON blocks in the message (```json ... ``` or raw { ... })
    const jsonPatterns = [
      // fenced code blocks
      /```(?:json)?\s*\n?([\s\S]*?)```/g,
      // raw JSON objects (greedy match between outermost braces)
      /\{[\s\S]*"(?:confidence_score|action_plan|summary|affected_files|issue_number|status|current_step|completed_steps|pr_url)"[\s\S]*\}/g,
    ];

    for (const pattern of jsonPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const candidate = match[1] ?? match[0];
        try {
          const parsed = JSON.parse(candidate.trim());
          if (typeof parsed === "object" && parsed !== null) {
            // Check it has at least one scoping or execution field
            const hasScopingField =
              "confidence_score" in parsed ||
              "action_plan" in parsed ||
              "affected_files" in parsed ||
              "summary" in parsed;
            const hasExecutionField =
              "current_step" in parsed ||
              "completed_steps" in parsed ||
              "pr_url" in parsed;
            if (hasScopingField || hasExecutionField || "issue_number" in parsed) {
              console.log(`[API /api/devin/status] Extracted output from message index ${i}`);
              return parsed as ScopingOutput | ExecutionOutput;
            }
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  console.log(`[API /api/devin/status] GET sessionId=${sessionId}`);

  try {
    const session = await getSession(sessionId);
    let parsedOutput = parseStructuredOutput(session.structured_output);

    console.log(`[API /api/devin/status] session.status_enum=${session.status_enum}`);
    console.log(`[API /api/devin/status] session.structured_output type=${typeof session.structured_output}, value=${JSON.stringify(session.structured_output)?.slice(0, 500)}`);
    console.log(`[API /api/devin/status] parsedOutput=${parsedOutput ? JSON.stringify(parsedOutput).slice(0, 500) : "null"}`);
    console.log(`[API /api/devin/status] messages count=${session.messages?.length ?? 0}`);

    // Fallback: if structured_output is empty, try to extract from messages
    if (!parsedOutput && session.messages && session.messages.length > 0) {
      console.log(`[API /api/devin/status] structured_output is null, scanning messages for JSON...`);
      parsedOutput = extractOutputFromMessages(session.messages);
      if (parsedOutput) {
        console.log(`[API /api/devin/status] Found output in messages: ${JSON.stringify(parsedOutput).slice(0, 500)}`);
      } else {
        console.log(`[API /api/devin/status] No structured output found in messages either`);
      }
    }

    return NextResponse.json({
      status: session.status_enum,
      structured_output: parsedOutput,
      pull_request: session.pull_request,
      url: session.url,
      title: session.title,
      created_at: session.created_at,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[API /api/devin/status] Error for ${sessionId}: ${message}`);

    if (message.includes("404")) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
