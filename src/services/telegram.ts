import { fetch } from "undici";

export type TelegramConfig = {
  configured: boolean;
  reason?: string;
};

export function telegramStatus(): TelegramConfig {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { configured: false, reason: "TELEGRAM_BOT_TOKEN missing" };
  if (!process.env.TELEGRAM_CHAT_ID) return { configured: false, reason: "TELEGRAM_CHAT_ID missing" };
  return { configured: true };
}

export type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; is_bot: boolean; first_name?: string };
    chat: { id: number };
    date: number;
    text?: string;
  };
};

export async function getUpdates(
  offset: number,
  timeoutSec: number,
  signal: AbortSignal
): Promise<TgUpdate[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${timeoutSec}&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram getUpdates ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  if (!data?.ok) throw new Error(`Telegram getUpdates error: ${data?.description}`);
  return (data.result as TgUpdate[]) || [];
}

export async function sendMessage(text: string, chatIdOverride?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${body.slice(0, 200)}`);
  }
}
