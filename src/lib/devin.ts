import { DevinSession } from "@/lib/types";

const DEVIN_API_BASE = "https://api.devin.ai/v1";

function getApiKey(): string {
  const key = process.env.DEVIN_API_KEY;
  if (!key) {
    throw new Error("DEVIN_API_KEY environment variable is not set");
  }
  return key;
}

async function handleResponse<T>(response: Response, label: string): Promise<T> {
  const body = await response.text();
  console.log(`[Devin] ${label} Response: ${response.status} ${response.statusText}`);
  console.log(`[Devin] ${label} Body: ${body.slice(0, 2000)}${body.length > 2000 ? "...(truncated)" : ""}`);

  if (!response.ok) {
    throw new Error(
      `Devin API error (${response.status}): ${body}`
    );
  }
  return JSON.parse(body) as T;
}

export async function createSession(params: {
  prompt: string;
  title: string;
  tags: string[];
}): Promise<{ session_id: string; url: string }> {
  const url = `${DEVIN_API_BASE}/sessions`;
  const payload = {
    prompt: params.prompt,
    title: params.title,
    tags: params.tags,
    idempotent: true,
  };

  console.log(`[Devin] POST ${url}`);
  console.log(`[Devin] createSession payload: ${JSON.stringify({ title: payload.title, tags: payload.tags, idempotent: payload.idempotent, prompt_length: payload.prompt.length })}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<{ session_id: string; url: string }>(response, "createSession");
}

export async function getSession(sessionId: string): Promise<DevinSession> {
  const url = `${DEVIN_API_BASE}/sessions/${sessionId}`;
  console.log(`[Devin] GET ${url}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  return handleResponse<DevinSession>(response, `getSession(${sessionId})`);
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<void> {
  const url = `${DEVIN_API_BASE}/sessions/${sessionId}/message`;
  console.log(`[Devin] POST ${url}`);
  console.log(`[Devin] sendMessage payload: ${JSON.stringify({ message: message.slice(0, 200) })}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ message }),
  });

  console.log(`[Devin] sendMessage Response: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const body = await response.text();
    console.error(`[Devin] sendMessage Error: ${body}`);
    throw new Error(
      `Devin API error (${response.status}): ${body}`
    );
  }
}
