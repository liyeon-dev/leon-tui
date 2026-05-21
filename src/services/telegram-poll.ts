import { getUpdates, sendMessage, telegramStatus } from "./telegram.js";
import { appendInbox, loadTelegramState, saveTelegramState } from "../store/inbox.js";
import { appendNote } from "../store/notes.js";
import {
  endLiveChat,
  getLiveSessionId,
  handleIncomingTelegram,
  startLiveChat,
  LIVE_IDLE_MS,
} from "./liveChat.js";
import type { InboxMessage } from "../types.js";

type PollListener = (msg: InboxMessage) => void;
const listeners = new Set<PollListener>();

export function onInbox(fn: PollListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let controller: AbortController | null = null;
let running = false;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export type PollerStatus = {
  running: boolean;
  reason?: string;
};

export function pollerStatus(): PollerStatus {
  const tg = telegramStatus();
  if (!tg.configured) return { running: false, reason: tg.reason };
  return { running };
}

async function safeSend(text: string): Promise<void> {
  try { await sendMessage(text); } catch { /* ignore — poller should not crash on send error */ }
}

export function startPolling(): void {
  if (running) return;
  const tg = telegramStatus();
  if (!tg.configured) return;
  const targetChat = String(process.env.TELEGRAM_CHAT_ID);
  controller = new AbortController();
  running = true;
  const signal = controller.signal;

  (async () => {
    let offset = (await loadTelegramState()).last_update_id + 1;
    while (!signal.aborted) {
      try {
        const updates = await getUpdates(offset, 25, signal);
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (!msg || !msg.text) continue;
          if (msg.from.is_bot) continue;
          if (String(msg.chat.id) !== targetChat) continue;

          const text = msg.text;
          const ts = msg.date * 1000;

          if (/^\s*\/chat\b/i.test(text)) {
            const existing = await getLiveSessionId();
            if (existing) {
              await safeSend("Already live.");
            } else {
              await startLiveChat();
              await safeSend("LEON live. Send /endchat to stop.");
            }
            continue;
          }

          if (/^\s*\/endchat\b/i.test(text)) {
            const existing = await getLiveSessionId();
            if (!existing) {
              await safeSend("Already in automation mode.");
            } else {
              await endLiveChat();
              await safeSend("Back to automation mode.");
            }
            continue;
          }

          const noteMatch = text.match(/^\s*note:\s*(.+)$/is);
          if (noteMatch) {
            const stripped = noteMatch[1]!.trim();
            if (stripped) {
              await appendNote({ ts, source: "telegram", text: stripped });
              await safeSend("Noted.");
            }
            continue;
          }

          const liveId = await getLiveSessionId();
          if (liveId) {
            const state = await loadTelegramState();
            const startedAt = state.live_started_at ?? 0;
            if (Date.now() - startedAt > LIVE_IDLE_MS) {
              await endLiveChat();
              await safeSend("Live session timed out (30 min idle). Send /chat to resume.");
              const entry: InboxMessage = { update_id: u.update_id, ts, text };
              await appendInbox(entry);
              for (const l of listeners) { try { l(entry); } catch { /* ignore */ } }
              continue;
            }
            try {
              await handleIncomingTelegram(liveId, text);
            } catch (err: any) {
              await safeSend(`Live chat error: ${err?.message || String(err)}`);
            }
            continue;
          }

          const entry: InboxMessage = { update_id: u.update_id, ts, text };
          await appendInbox(entry);
          for (const l of listeners) { try { l(entry); } catch { /* ignore */ } }
        }
        if (updates.length > 0) {
          const state = await loadTelegramState();
          await saveTelegramState({ ...state, last_update_id: offset - 1 });
        }
      } catch (err: any) {
        if (signal.aborted) break;
        await sleep(5000, signal);
      }
    }
    running = false;
  })();
}

export function stopPolling(): void {
  if (controller) {
    try { controller.abort(); } catch { /* ignore */ }
    controller = null;
  }
  running = false;
}
