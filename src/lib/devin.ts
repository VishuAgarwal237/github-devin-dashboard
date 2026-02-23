import { DevinSession } from "@/lib/types";

const DEVIN_API_BASE = "https://api.devin.ai/v1";

function getApiKey(): string {
  const key = process.env.DEVIN_API_KEY;
  if (!key) {
    throw new Error("DEVIN_API_KEY environment variable is not set");
  }
  return key;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Devin API error (${response.status}): ${body}`
    );
  }
  return response.json() as Promise<T>;
}

export async function createSession(params: {
  prompt: string;
  title: string;
  tags: string[];
}): Promise<{ session_id: string; url: string }> {
  const response = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      prompt: params.prompt,
      title: params.title,
      tags: params.tags,
      idempotent: true,
    }),
  });

  return handleResponse<{ session_id: string; url: string }>(response);
}

export async function getSession(sessionId: string): Promise<DevinSession> {
  const response = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  return handleResponse<DevinSession>(response);
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<void> {
  const response = await fetch(
    `${DEVIN_API_BASE}/sessions/${sessionId}/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Devin API error (${response.status}): ${body}`
    );
  }
}
