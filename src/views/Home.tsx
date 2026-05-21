import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/Menu.js";
import type { Job, LogEntry } from "../types.js";

type HomeChoice = "chat" | "automations";

type Props = {
  jobs: Job[];
  activity: LogEntry[];
  activeTimers: number;
  onPick: (choice: HomeChoice) => void;
};

export function Home({ jobs, activity, activeTimers, onPick }: Props) {
  const enabled = jobs.filter((j) => j.enabled).length;

  const items: MenuItem<HomeChoice>[] = [
    {
      key: "chat",
      label: "💬  Chat with DeepSeek",
      hint: "Resume or start a conversation",
    },
    {
      key: "automations",
      label: "⚡  Automations",
      hint: `${jobs.length} saved · ${enabled} active · ${activeTimers} timer${activeTimers === 1 ? "" : "s"} running`,
    },
  ];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎WHAT WOULD YOU LIKE TO DO?</Text>
      </Box>

      <Menu items={items} onSelect={onPick} />

      {activity.length > 0 && (
        <Box marginTop={2} flexDirection="column">
          <Text bold color="cyan">RECENT ACTIVITY</Text>
          {activity.slice(-4).map((e, i) => {
            const time = new Date(e.ts).toLocaleTimeString();
            const color = e.level === "error" ? "red" : "gray";
            return (
              <Text key={i} color={color}>
                {"  "}[{time}] {e.source}: {e.message}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
