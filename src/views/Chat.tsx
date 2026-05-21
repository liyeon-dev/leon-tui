import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { ChatMessage } from "../components/ChatMessage.js";
import { InputBox } from "../components/InputBox.js";
import { streamChat } from "../services/deepseek.js";
import { buildUserContext } from "../services/userMemory.js";
import { mirrorAssistantToTelegram } from "../services/liveChat.js";
import { appendNote } from "../store/notes.js";
import { appendMessage, deriveTitle } from "../store/sessions.js";
import type { Message, Session } from "../types.js";

type Props = {
  session: Session;
  onUpdate: (session: Session) => void;
};

export function Chat({ session, onUpdate }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Reset input when switching sessions
  useEffect(() => {
    setInput("");
    setError(null);
    setStreaming(null);
    cancelRef.current = false;
  }, [session.id]);

  async function handleSubmit(value: string) {
    const text = value.trim();
    if (!text || streaming !== null) return;
    setError(null);
    setInput("");

    const noteMatch = text.match(/^\/note\s+(.+)$/is);
    if (noteMatch) {
      const noteText = noteMatch[1]!.trim();
      try {
        await appendNote({ ts: Date.now(), source: "tui", text: noteText });
        const ack: Message = { role: "assistant", content: `Noted: ${noteText}`, ts: Date.now() };
        onUpdate(appendMessage(session, ack));
      } catch (err: any) {
        setError(`Failed to save note: ${err?.message || String(err)}`);
      }
      return;
    }

    const userMsg: Message = { role: "user", content: text, ts: Date.now() };
    let next = appendMessage(session, userMsg);
    if (session.messages.length === 0 || session.title === "New chat") {
      next = { ...next, title: deriveTitle(next) };
    }
    onUpdate(next);

    setStreaming("");
    try {
      const userCtx = await buildUserContext().catch(() => ({ contextSystemMessage: null as string | null }));
      let acc = "";
      for await (const chunk of streamChat(next.messages, {
        systemAppend: userCtx.contextSystemMessage ?? undefined,
      })) {
        if (cancelRef.current) break;
        acc += chunk;
        setStreaming(acc);
      }
      const assistantMsg: Message = { role: "assistant", content: acc, ts: Date.now() };
      const finalSession = appendMessage(next, assistantMsg);
      onUpdate(finalSession);
      void mirrorAssistantToTelegram(finalSession.id, acc).catch(() => undefined);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setStreaming(null);
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎{session.title}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {session.messages.length === 0 && !streaming && (
          <Text color="gray" dimColor>  Say something to start the conversation...</Text>
        )}
        {session.messages.slice(-12).map((m, i) => (
          <ChatMessage key={i} msg={m} />
        ))}
        {streaming !== null && (
          <ChatMessage msg={{ role: "assistant", content: streaming, ts: Date.now() }} streaming />
        )}
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">! {error}</Text>
        </Box>
      )}

      {streaming !== null ? (
        <Box paddingX={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="gray"> generating...</Text>
        </Box>
      ) : (
        <InputBox
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type your message, /note <text> to save a note, Enter to send..."
          hint="Enter send · Shift+Enter / Alt+Enter newline · /note <text> · Esc home"
        />
      )}
    </Box>
  );
}
