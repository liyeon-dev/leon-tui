import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { InputBox } from "../components/InputBox.js";
import { Menu, type MenuItem } from "../components/Menu.js";
import type { Task, TaskCategory, TaskStatus } from "../types.js";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "../types.js";
import { newTask } from "../store/tasks.js";

type Props = {
  categories: TaskCategory[];
  existingTask?: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
};

type Step = "title" | "description" | "due" | "category" | "status" | "reminder" | "review";

export function TaskForm({ categories, existingTask, onSave, onCancel: _onCancel }: Props) {
  const isEdit = Boolean(existingTask);

  const [step, setStep] = useState<Step>("title");
  const [title, setTitle] = useState(existingTask?.title ?? "");
  const [titleInput, setTitleInput] = useState(existingTask?.title ?? "");
  const [description, setDescription] = useState(existingTask?.description ?? "");
  const [descriptionInput, setDescriptionInput] = useState(existingTask?.description ?? "");
  const [dueInput, setDueInput] = useState(
    existingTask?.due_date !== undefined
      ? new Date(existingTask.due_date).toLocaleString()
      : ""
  );
  const [dueTs, setDueTs] = useState<number | undefined>(existingTask?.due_date);
  const [dueError, setDueError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(existingTask?.category ?? "");
  const [status, setStatus] = useState<TaskStatus>(existingTask?.status ?? "not_started");
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(
    Boolean(existingTask?.reminders?.enabled)
  );

  function buildTask(): Task {
    if (isEdit && existingTask) {
      return {
        ...existingTask,
        title: title.trim(),
        description,
        category,
        status,
        due_date: dueTs,
        reminders: {
          ...existingTask.reminders,
          enabled: dueTs !== undefined ? reminderEnabled : false,
        },
        updated_at: Date.now(),
      };
    }
    return newTask({
      title: title.trim(),
      description,
      category,
      status,
      due_date: dueTs,
      reminders: { enabled: dueTs !== undefined ? reminderEnabled : false },
    });
  }

  function goBack() {
    if (step === "description") setStep("title");
    else if (step === "due") setStep("description");
    else if (step === "category") setStep("due");
    else if (step === "status") setStep("category");
    else if (step === "reminder") setStep("status");
    else if (step === "review") setStep(dueTs !== undefined ? "reminder" : "status");
  }

  useInput((input, key) => {
    if (step !== "review") return;
    if (key.return || input.toLowerCase() === "s") {
      onSave(buildTask());
    } else if (input.toLowerCase() === "b") {
      goBack();
    }
  });

  function handleTitleSubmit(v: string) {
    const trimmed = v.trim();
    if (!trimmed) return;
    setTitle(trimmed);
    setStep("description");
  }

  function handleDescriptionSubmit(v: string) {
    setDescription(v);
    setStep("due");
  }

  function handleDueSubmit(v: string) {
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      setDueTs(undefined);
      setDueError(null);
      setStep("category");
      return;
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      setDueError(`Could not parse "${trimmed}" as a date.`);
      return;
    }
    setDueTs(d.getTime());
    setDueError(null);
    setStep("category");
  }

  const categoryItems: MenuItem<string>[] = [
    ...categories.map((c) => ({ key: c.name, label: c.name })),
    { key: "__none__", label: "(none)" },
  ];

  const statusItems: MenuItem<TaskStatus>[] = TASK_STATUSES.map((s) => ({
    key: s,
    label: TASK_STATUS_LABELS[s],
  }));

  const reminderItems: MenuItem<string>[] = [
    { key: "on", label: "Auto Reminder: ON" },
    { key: "off", label: "Auto Reminder: OFF" },
  ];

  const categoryInitialIndex = (() => {
    if (!category) return categoryItems.length - 1;
    const idx = categories.findIndex((c) => c.name === category);
    return idx >= 0 ? idx : categoryItems.length - 1;
  })();

  const statusInitialIndex = Math.max(0, TASK_STATUSES.indexOf(status));
  const reminderInitialIndex = reminderEnabled ? 0 : 1;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎{isEdit ? "EDIT TASK" : "NEW TASK"}</Text>
      </Box>

      {step !== "title" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text><Text color="cyan">title    </Text> {title}</Text>
        </Box>
      )}
      {step !== "title" && step !== "description" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan">description</Text>
          <Box paddingLeft={2}>
            <Text>{description || <Text color="gray" dimColor>(empty)</Text>}</Text>
          </Box>
        </Box>
      )}
      {step !== "title" && step !== "description" && step !== "due" && (
        <Box marginBottom={1}>
          <Text>
            <Text color="cyan">due      </Text>
            {dueTs !== undefined
              ? new Date(dueTs).toLocaleString()
              : <Text color="gray">no due date</Text>}
          </Text>
        </Box>
      )}
      {(step === "status" || step === "reminder" || step === "review") && (
        <Box marginBottom={1}>
          <Text>
            <Text color="cyan">category </Text>
            {category ? category : <Text color="gray">(none)</Text>}
          </Text>
        </Box>
      )}
      {(step === "reminder" || step === "review") && (
        <Box marginBottom={1}>
          <Text>
            <Text color="cyan">status   </Text>
            {TASK_STATUS_LABELS[status]}
          </Text>
        </Box>
      )}

      {step === "title" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Title</Text>
          <InputBox
            value={titleInput}
            onChange={setTitleInput}
            onSubmit={handleTitleSubmit}
            placeholder="What needs doing?"
            hint="Enter to continue · Esc cancel"
          />
        </Box>
      )}

      {step === "description" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Description</Text>
          <InputBox
            value={descriptionInput}
            onChange={setDescriptionInput}
            onSubmit={handleDescriptionSubmit}
            placeholder="Optional details..."
            hint="Enter to continue (empty OK) · Shift+Enter newline · Esc cancel"
          />
        </Box>
      )}

      {step === "due" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Due date</Text>
          <InputBox
            value={dueInput}
            onChange={setDueInput}
            onSubmit={handleDueSubmit}
            placeholder="e.g. 2026-05-30 14:00 (empty = no due date)"
            hint="Enter to continue · Esc cancel"
          />
          {dueError && <Text color="red">! {dueError}</Text>}
        </Box>
      )}

      {step === "category" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Category</Text>
          <Menu
            items={categoryItems}
            initialIndex={categoryInitialIndex}
            onSelect={(k) => {
              setCategory(k === "__none__" ? "" : k);
              setStep("status");
            }}
          />
        </Box>
      )}

      {step === "status" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Status</Text>
          <Menu
            items={statusItems}
            initialIndex={statusInitialIndex}
            onSelect={(k) => {
              setStatus(k);
              if (dueTs === undefined) {
                setReminderEnabled(false);
                setStep("review");
              } else {
                setStep("reminder");
              }
            }}
          />
        </Box>
      )}

      {step === "reminder" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Auto Reminder</Text>
          <Menu
            items={reminderItems}
            initialIndex={reminderInitialIndex}
            onSelect={(k) => {
              setReminderEnabled(k === "on");
              setStep("review");
            }}
          />
        </Box>
      )}

      {step === "review" && (
        <Box flexDirection="column">
          <Text color="green" bold>{isEdit ? "Updated task:" : "New task:"}</Text>
          <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
            <Text><Text color="cyan">title    </Text> {title}</Text>
            <Box flexDirection="column">
              <Text color="cyan">description</Text>
              <Box paddingLeft={2}>
                <Text>{description || <Text color="gray" dimColor>(empty)</Text>}</Text>
              </Box>
            </Box>
            <Text>
              <Text color="cyan">due      </Text>
              {dueTs !== undefined
                ? new Date(dueTs).toLocaleString()
                : <Text color="gray">no due date</Text>}
            </Text>
            <Text>
              <Text color="cyan">category </Text>
              {category ? category : <Text color="gray">(none)</Text>}
            </Text>
            <Text>
              <Text color="cyan">status   </Text>
              {TASK_STATUS_LABELS[status]}
            </Text>
            <Text>
              <Text color="cyan">reminder </Text>
              {dueTs === undefined
                ? <Text color="gray">n/a (no due date)</Text>
                : reminderEnabled
                  ? <Text color="green">on</Text>
                  : <Text color="gray">off</Text>}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              <Text color="green">[S]</Text>/<Text color="green">Enter</Text> save  ·  <Text color="yellow">[B]</Text> back  ·  Esc cancel
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
