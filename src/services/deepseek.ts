import { fetch } from "undici";
import type { Message } from "../types.js";

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function apiKey(): string {
  const k = process.env.DEEPSEEK_API_KEY;
  if (!k) throw new Error("DEEPSEEK_API_KEY is not set. Edit .env and restart LEON.");
  return k;
}

type ChatOpts = {
  temperature?: number;
  json?: boolean;
  systemAppend?: string;
};

function toApiMessages(messages: Message[], opts?: ChatOpts) {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
  if (opts?.systemAppend) {
    out.unshift({ role: "system", content: opts.systemAppend });
  }
  return out;
}

export async function chatOnce(messages: Message[], opts: ChatOpts = {}): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: toApiMessages(messages, opts),
      temperature: opts.temperature ?? 0.7,
      stream: false,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("DeepSeek response missing content");
  return content;
}

export async function* streamChat(
  messages: Message[],
  opts: ChatOpts = {}
): AsyncGenerator<string, void, void> {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: toApiMessages(messages, opts),
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as any) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const obj = JSON.parse(payload);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) yield delta;
      } catch {
        // skip non-JSON keepalives
      }
    }
  }
}
