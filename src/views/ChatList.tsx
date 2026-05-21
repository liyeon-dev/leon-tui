import React from "react";
import { Box, Text, useInput } from "ink";
import { Menu, type MenuItem } from "../components/Menu.js";
import { loadTelegramState } from "../store/inbox.js";
import type { Session } from "../types.js";

type Props = {
  sessions: Session[];
  onNew: () => void;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};

export function ChatList({ sessions, onNew, onOpen, onDelete }: Props) {
  const sorted = [...sessions].sort((a, b) => b.updated_at - a.updated_at);
  const [liveId, setLiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const tick = () => {
      loadTelegramState()
        .then((s) => { if (!cancelled) setLiveId(s.live_session_id ?? null); })
        .catch(() => undefined);
    };
    tick();
    const handle = setInterval(tick, 2500);
    return () => { cancelled = true; clearInterval(handle); };
  }, []);

  const items: MenuItem<string>[] = [
    { key: "__new__", label: "[+]  Start a new chat", hint: "Fresh conversation with DeepSeek" },
    ...sorted.map((s) => ({
      key: s.id,
      label: s.id === liveId ? `🗨  ${s.title}  [live]` : `🗨  ${s.title}`,
      hint: `${s.messages.length} msg · updated ${new Date(s.updated_at).toLocaleString()}`,
    })),
  ];

  // Track cursor via a small wrapper so we can intercept 'd' for delete on the current selection
  const [cursor, setCursor] = React.useState(0);
  const items2 = items;

  useInput((input) => {
    if (input.toLowerCase() !== "d") return;
    const item = items2[cursor];
    if (!item || item.key === "__new__") return;
    onDelete(item.key);
  });

  function handleSelect(key: string) {
    if (key === "__new__") onNew();
    else onOpen(key);
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎CHAT SESSIONS</Text>
      </Box>

      {sessions.length === 0 && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor>No sessions yet — start one below.</Text>
        </Box>
      )}

      <MenuWithCursor items={items2} onSelect={handleSelect} onCursorChange={setCursor} />

      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ select · Enter open · d delete · Esc back</Text>
      </Box>
    </Box>
  );
}

// Variant of Menu that surfaces the current cursor for sibling key handlers.
function MenuWithCursor<T extends string | number>({
  items,
  onSelect,
  onCursorChange,
}: {
  items: MenuItem<T>[];
  onSelect: (key: T) => void;
  onCursorChange: (i: number) => void;
}) {
  // delegate to Menu but mirror the cursor position via a wrapping state
  // (Menu manages its own cursor; we re-implement minimal logic here.)
  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => onCursorChange(cursor), [cursor, onCursorChange]);
  React.useEffect(() => {
    if (cursor > items.length - 1) setCursor(Math.max(0, items.length - 1));
  }, [items.length]);

  useInput((input, key) => {
    if (items.length === 0) return;
    if (key.upArrow || input === "k") {
      setCursor((c) => (c - 1 + items.length) % items.length);
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c + 1) % items.length);
    } else if (key.return) {
      const it = items[cursor];
      if (it && !it.disabled) onSelect(it.key);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((it, i) => {
        const isActive = i === cursor;
        return (
          <Box key={String(it.key)} flexDirection="column">
            <Text color={isActive ? "green" : "white"} bold={isActive}>
              {isActive ? "▶ " : "  "}
              {it.label}
            </Text>
            {it.hint && (
              <Text color="gray" dimColor>{"    "}{it.hint}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
