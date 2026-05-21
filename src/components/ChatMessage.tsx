import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../types.js";

export function ChatMessage({ msg, streaming }: { msg: Message; streaming?: boolean }) {
  const isUser = msg.role === "user";
  const label = isUser ? "Me" : "Leone";
  const color = isUser ? "yellow" : "cyan";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>
        {label}{streaming ? " ▌" : ""}
      </Text>
      <Box paddingLeft={2}>
        <Text>{msg.content || (streaming ? "…" : "")}</Text>
      </Box>
    </Box>
  );
}
