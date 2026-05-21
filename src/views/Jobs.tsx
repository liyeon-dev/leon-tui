import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Job } from "../types.js";

type Props = {
  jobs: Job[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

export function Jobs({ jobs, onCreate, onEdit, onToggle, onDelete }: Props) {
  const total = jobs.length + 1; // +1 for the "create new" entry at index 0
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
      } else {
        const job = jobs[cursor - 1];
        if (job) onEdit(job.id);
      }
    } else if (input === " ") {
      if (cursor === 0) return;
      const job = jobs[cursor - 1];
      if (job) onToggle(job.id);
    } else if (input.toLowerCase() === "d") {
      if (cursor === 0) return;
      const job = jobs[cursor - 1];
      if (!job) return;
      if (confirmDelete === job.id) {
        onDelete(job.id);
        setConfirmDelete(null);
        setCursor((c) => Math.max(0, Math.min(c, total - 2)));
      } else {
        setConfirmDelete(job.id);
      }
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎AUTOMATIONS</Text>
      </Box>

      <Box flexDirection="column">
        <Text color={cursor === 0 ? "green" : "white"} bold={cursor === 0}>
          {cursor === 0 ? "▶ " : "  "}[+]  Create new automation
        </Text>
        <Text color="gray" dimColor>{"    "}Describe it in plain English; AI will ask follow-ups</Text>
      </Box>

      {jobs.length === 0 ? (
        <Box marginTop={1}>
          <Text color="gray" dimColor>  No automations saved yet.</Text>
        </Box>
      ) : (
        jobs.map((j, i) => {
          const active = i + 1 === cursor;
          const last = j.last_fired_at ? new Date(j.last_fired_at).toLocaleString() : "never";
          const fired = j.run_once && !j.enabled && j.last_fired_at !== undefined;
          const statusColor = j.last_status === "error" ? "red" : "gray";
          const titleColor = fired ? "gray" : (active ? "green" : "white");
          const scheduleLine = j.fire_at !== undefined
            ? `once at: ${new Date(j.fire_at).toLocaleString()}`
            : `cron: ${j.cron_expr}`;
          return (
            <Box key={j.id} flexDirection="column" marginTop={1}>
              <Text color={titleColor} bold={active} dimColor={fired}>
                {active ? "▶ " : "  "}
                <Text color={j.enabled ? "green" : "gray"}>{j.enabled ? "● " : "○ "}</Text>
                {j.title}
                {j.run_once ? <Text color="magenta">  [1x{fired ? " fired" : ""}]</Text> : null}
              </Text>
              <Text color="gray">    {scheduleLine}  ({j.timezone})</Text>
              <Text color="gray">
                {"    "}action: {j.action.type}  ·  memory: {j.memory?.enabled
                  ? <Text color="green">on{j.memory.summary ? ` (${j.memory.summary.length} chars)` : ""}</Text>
                  : <Text color="gray">off</Text>}
                {j.data_sources && j.data_sources.length > 0
                  ? <Text color="cyan">  ·  sources: {j.data_sources.join(", ")}</Text>
                  : null}
              </Text>
              <Text color={statusColor}>    last: {last}{j.last_status === "error" && j.last_error ? ` — ${j.last_error}` : ""}</Text>
              {confirmDelete === j.id && (
                <Text color="red">    Press 'd' again to confirm delete</Text>
              )}
            </Box>
          );
        })
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ select · Enter create/edit · Space toggle · d delete (twice) · Esc back
        </Text>
      </Box>
    </Box>
  );
}
