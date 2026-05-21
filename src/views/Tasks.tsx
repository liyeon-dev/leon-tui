import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, TaskStatus } from "../types.js";
import { TASK_STATUS_LABELS } from "../types.js";

type Props = {
  tasks: Task[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onManageCategories: () => void;
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: "gray",
  in_progress: "cyan",
  on_hold: "yellow",
  completed: "green",
};

export function Tasks({ tasks, onCreate, onEdit, onDelete, onManageCategories }: Props) {
  const total = tasks.length + 2; // [+] create, [⚙] manage, then tasks
  const [cursor, setCursor] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setCursor((c) => (c - 1 + total) % total);
      setConfirmDelete(null);
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c + 1) % total);
      setConfirmDelete(null);
    } else if (key.return) {
      if (cursor === 0) {
        onCreate();
      } else if (cursor === 1) {
        onManageCategories();
      } else {
        const t = tasks[cursor - 2];
        if (t) onEdit(t.id);
      }
    } else if (input.toLowerCase() === "d") {
      if (cursor < 2) return;
      const t = tasks[cursor - 2];
      if (!t) return;
      if (confirmDelete === t.id) {
        onDelete(t.id);
        setConfirmDelete(null);
        setCursor((c) => Math.max(0, Math.min(c, total - 2)));
      } else {
        setConfirmDelete(t.id);
      }
    }
  });

  const now = Date.now();

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎TASKS</Text>
      </Box>

      <Box flexDirection="column">
        <Text color={cursor === 0 ? "green" : "white"} bold={cursor === 0}>
          {cursor === 0 ? "▶ " : "  "}[+]  Create new task
        </Text>
        <Text color={cursor === 1 ? "green" : "white"} bold={cursor === 1}>
          {cursor === 1 ? "▶ " : "  "}[⚙]  Manage categories
        </Text>
      </Box>

      {tasks.length === 0 ? (
        <Box marginTop={1}>
          <Text color="gray" dimColor>  No tasks yet.</Text>
        </Box>
      ) : (
        tasks.map((t, i) => {
          const active = i + 2 === cursor;
          const overdue =
            t.due_date !== undefined && t.due_date < now && t.status !== "completed";
          const statusColor = STATUS_COLORS[t.status];
          const statusLabel = TASK_STATUS_LABELS[t.status];
          const titleColor = active ? "green" : "white";
          const dueText = t.due_date !== undefined
            ? new Date(t.due_date).toLocaleString()
            : "no due date";
          const dueColor = overdue ? "red" : "gray";
          return (
            <Box key={t.id} flexDirection="column" marginTop={1}>
              <Text color={titleColor} bold={active}>
                {active ? "▶ " : "  "}
                {t.title}
                {t.reminders.enabled ? <Text color="yellow">  🔔</Text> : null}
              </Text>
              <Text>
                {"    "}
                <Text color={statusColor} bold>[{statusLabel}]</Text>
                {t.category ? <Text color="magenta">  [{t.category}]</Text> : null}
              </Text>
              <Text color={dueColor}>
                {"    "}due: {dueText}{overdue ? " (overdue)" : ""}
              </Text>
              {confirmDelete === t.id && (
                <Text color="red">    Press 'd' again to confirm delete</Text>
              )}
            </Box>
          );
        })
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ select · Enter edit · d delete (twice) · Esc back
        </Text>
      </Box>
    </Box>
  );
}
