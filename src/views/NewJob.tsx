import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { promises as fs } from "node:fs";
import path from "node:path";
import { InputBox } from "../components/InputBox.js";
import { continueAuthoring, type AuthorMsg, type JobDraft } from "../services/jobAuthor.js";
import { testRunJob, type TestRunResult } from "../scheduler/execute.js";
import type { Job, DataSource } from "../types.js";
import { newJob } from "../store/jobs.js";

type Stage = "talking" | "thinking" | "review" | "error" | "testing";

type Props = {
  defaultTimezone: string;
  existingJob?: Job;            // if present → edit mode
  availableSources: DataSource[];
  onSave: (job: Job) => void;
  onCancel: () => void;
};

export function NewJob({ defaultTimezone, existingJob, availableSources, onSave, onCancel }: Props) {
  const isEdit = Boolean(existingJob);
  const [stage, setStage] = useState<Stage>("talking");
  const [messages, setMessages] = useState<AuthorMsg[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  // When /promptfile runs before a draft exists, we stash the content and
  // apply it to whatever draft the AI eventually produces.
  const [pendingPromptOverride, setPendingPromptOverride] = useState<string | null>(null);

  function jobFromDraft(d: JobDraft): Job {
    const memEnabled = Boolean(d.memory_enabled);
    const sources = d.data_sources ?? [];
    if (isEdit && existingJob) {
      return {
        ...existingJob,
        title: d.title,
        cron_expr: d.cron_expr,
        fire_at: d.fire_at,
        run_once: d.run_once,
        timezone: d.timezone,
        prompt_template: d.prompt_template,
        action: d.action,
        memory: {
          enabled: memEnabled,
          summary: existingJob.memory?.summary ?? "",
          last_summarized_fire_ts: existingJob.memory?.last_summarized_fire_ts,
        },
        data_sources: sources,
      };
    }
    return newJob({
      title: d.title,
      cron_expr: d.cron_expr,
      fire_at: d.fire_at,
      run_once: d.run_once,
      timezone: d.timezone,
      prompt_template: d.prompt_template,
      action: d.action,
      memory: { enabled: memEnabled, summary: "" },
      data_sources: sources,
    });
  }

  async function handleTest() {
    if (!draft || stage === "testing") return;
    setTestResult(null);
    setStage("testing");
    const result = await testRunJob(jobFromDraft(draft));
    setTestResult(result);
    setStage("review");
  }

  // Seed a greeting based on mode (assistant message; the LLM doesn't see this one,
  // but it gives the user clear guidance).
  useEffect(() => {
    if (isEdit && existingJob) {
      const sourcesLine = (existingJob.data_sources && existingJob.data_sources.length > 0)
        ? existingJob.data_sources.join(", ")
        : "none";
      const memoryLine = existingJob.memory?.enabled ? "on" : "off";
      setMessages([
        {
          role: "assistant",
          content:
            `Editing **${existingJob.title}**.\n` +
            `Schedule: \`${existingJob.cron_expr ?? (existingJob.fire_at ? `once @ ${new Date(existingJob.fire_at).toLocaleString()}` : "(none)")}\` (${existingJob.timezone}).\n` +
            `Sources: ${sourcesLine}  ·  Memory: ${memoryLine}.\n` +
            `What would you like to change?`,
        },
      ]);
    } else {
      setMessages([
        {
          role: "assistant",
          content:
            'Describe the automation you want. I will ask follow-ups if anything is unclear.\nExample: "remind me to go to the gym every weekday at 6PM with a workout list".',
        },
      ]);
    }
  }, [isEdit, existingJob?.id]);

  async function handleTestExisting() {
    if (!existingJob || stage === "testing" || stage === "thinking") return;
    const prevStage = stage;
    setTestResult(null);
    setStage("testing");
    const result = await testRunJob(existingJob);
    setTestResult(result);
    setStage(prevStage);
  }

  // Save / test / refine / restart controls
  useInput((ch, key) => {
    // Ctrl+T anywhere in edit mode runs a test on the SAVED version of the job.
    if (isEdit && key.ctrl && ch.toLowerCase() === "t") {
      void handleTestExisting();
      return;
    }
    if (stage !== "review") return;
    if (key.return || ch.toLowerCase() === "s") {
      if (!draft) return;
      onSave(jobFromDraft(draft));
    } else if (ch.toLowerCase() === "t") {
      void handleTest();
    } else if (ch.toLowerCase() === "e") {
      // Refine: keep draft as context, go back to talking so user can add a follow-up tweak
      setStage("talking");
      setTestResult(null);
      // draft stays — handleSubmit will use it as existingJob baseline for the AI
    } else if (ch.toLowerCase() === "r") {
      // Hard restart: clear everything and seed the opening greeting again
      setStage("talking");
      setDraft(null);
      setTestResult(null);
      const sourcesLine = isEdit && existingJob && existingJob.data_sources && existingJob.data_sources.length > 0
        ? existingJob.data_sources.join(", ")
        : "none";
      const memoryLine = isEdit && existingJob?.memory?.enabled ? "on" : "off";
      setMessages([
        {
          role: "assistant",
          content: isEdit && existingJob
            ? `Editing **${existingJob.title}**.\n` +
              `Schedule: \`${existingJob.cron_expr ?? (existingJob.fire_at ? `once @ ${new Date(existingJob.fire_at).toLocaleString()}` : "(none)")}\` (${existingJob.timezone}).\n` +
              `Sources: ${sourcesLine}  ·  Memory: ${memoryLine}.\n` +
              `What would you like to change?`
            : 'Describe the automation you want. I will ask follow-ups if anything is unclear.\nExample: "remind me to go to the gym every weekday at 6PM with a workout list".',
        },
      ]);
    }
  });

  type FrontMatter = {
    title?: string;
    cron_expr?: string;
    fire_at?: number;
    run_once?: boolean;
    timezone?: string;
    data_sources?: string[];
    memory_enabled?: boolean;
  };

  function parsePromptFile(content: string): { meta: FrontMatter; body: string } {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: content };
    const headBlock = m[1]!;
    const body = m[2]!;
    const meta: FrontMatter = {};
    for (const rawLine of headBlock.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const lm = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (!lm) continue;
      const key = lm[1]!;
      const rawVal = lm[2]!.trim();
      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal.slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        (meta as any)[key] = items;
        continue;
      }
      const stripped = rawVal.replace(/^["']|["']$/g, "");
      if (stripped === "true") { (meta as any)[key] = true; continue; }
      if (stripped === "false") { (meta as any)[key] = false; continue; }
      if (key === "fire_at") {
        const asNum = Number(stripped);
        if (!Number.isNaN(asNum) && stripped.length > 0) {
          (meta as any)[key] = asNum;
        } else {
          const d = new Date(stripped);
          if (!Number.isNaN(d.getTime())) (meta as any)[key] = d.getTime();
        }
        continue;
      }
      (meta as any)[key] = stripped;
    }
    return { meta, body: body.replace(/^\r?\n+/, "") };
  }

  function draftFromFrontMatter(meta: FrontMatter, body: string): JobDraft | null {
    if (!meta.cron_expr && !meta.fire_at) return null;
    return {
      title: meta.title ?? "Untitled automation",
      cron_expr: meta.cron_expr,
      fire_at: meta.fire_at,
      run_once: meta.run_once ?? Boolean(meta.fire_at),
      timezone: meta.timezone ?? defaultTimezone,
      prompt_template: body,
      action: { type: "telegram" },
      memory_enabled: meta.memory_enabled ?? false,
      data_sources: meta.data_sources ?? [],
    };
  }

  async function applyPromptFile(rawPath: string) {
    const trimmed = rawPath.trim().replace(/^["']|["']$/g, "");
    const resolved = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(process.cwd(), trimmed);
    let content: string;
    try {
      content = await fs.readFile(resolved, "utf8");
    } catch (err: any) {
      setError(`Could not read ${resolved}: ${err?.message || String(err)}`);
      setStage("error");
      return;
    }
    if (!content.trim()) {
      setError(`File ${resolved} is empty.`);
      setStage("error");
      return;
    }

    const { meta, body } = parsePromptFile(content);
    const hasFrontMatter = Object.keys(meta).length > 0;
    const fullDraft = hasFrontMatter ? draftFromFrontMatter(meta, body) : null;

    // Full job spec (front-matter with schedule) — skip the AI entirely.
    if (fullDraft) {
      setDraft(fullDraft);
      setPendingPromptOverride(null);
      setStage("review");
      const sched = fullDraft.cron_expr
        ? `cron \`${fullDraft.cron_expr}\``
        : `once @ ${new Date(fullDraft.fire_at!).toLocaleString()}`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Loaded full automation from ${resolved}.\n` +
            `Title: ${fullDraft.title} · ${sched} (${fullDraft.timezone})\n` +
            `Sources: ${fullDraft.data_sources!.length ? fullDraft.data_sources!.join(", ") : "none"} · Memory: ${fullDraft.memory_enabled ? "on" : "off"}\n` +
            `Press S/Enter to save, T to test, E to refine.`,
        },
      ]);
      return;
    }

    // Prompt-only file (no schedule in front-matter) — keep old behavior.
    const promptText = hasFrontMatter ? body : content;
    if (draft) {
      const updated = { ...draft, prompt_template: promptText };
      if (hasFrontMatter) {
        if (meta.title) updated.title = meta.title;
        if (meta.timezone) updated.timezone = meta.timezone;
        if (meta.data_sources) updated.data_sources = meta.data_sources;
        if (meta.memory_enabled !== undefined) updated.memory_enabled = meta.memory_enabled;
      }
      setDraft(updated);
      setStage("review");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Loaded prompt from ${resolved} (${promptText.length} chars). Other fields unchanged.` },
      ]);
      return;
    }
    if (existingJob) {
      const seedDraft: JobDraft = {
        title: meta.title ?? existingJob.title,
        cron_expr: existingJob.cron_expr,
        fire_at: existingJob.fire_at,
        run_once: existingJob.run_once ?? false,
        timezone: meta.timezone ?? existingJob.timezone,
        prompt_template: promptText,
        action: existingJob.action,
        memory_enabled: meta.memory_enabled ?? Boolean(existingJob.memory?.enabled),
        data_sources: meta.data_sources ?? existingJob.data_sources ?? [],
      };
      setDraft(seedDraft);
      setStage("review");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Loaded prompt from ${resolved} (${promptText.length} chars). Press S/Enter to save.` },
      ]);
      return;
    }
    setPendingPromptOverride(promptText);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          `Prompt loaded from ${resolved} (${promptText.length} chars). I'll use it verbatim.\n` +
          `Tip: add a front-matter block at the top of the file (cron_expr, timezone, etc.) to skip this step entirely.\n` +
          `For now, tell me when to run it (e.g. "every day at 8am with weather data").`,
      },
    ]);
    setStage("talking");
  }

  async function handleSubmit(value: string) {
    const text = value.trim();
    if (!text || stage === "thinking") return;
    setInput("");
    setError(null);

    const promptFileMatch = text.match(/^\/promptfile\s+(.+)$/is);
    if (promptFileMatch) {
      await applyPromptFile(promptFileMatch[1]!);
      return;
    }

    // Only user/assistant exchanges (the greeting we seeded is for display only —
    // but we still send it so the LLM sees the conversation continuity).
    const nextMessages: AuthorMsg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setStage("thinking");

    // Filter out the seeded display-only greeting if we're on the first turn —
    // it's the only assistant message and we want the LLM to see just the user's request first.
    let apiMessages =
      messages.length === 1 && messages[0]?.role === "assistant"
        ? [{ role: "user", content: text } as AuthorMsg]
        : nextMessages;

    if (pendingPromptOverride) {
      apiMessages = [
        {
          role: "user",
          content:
            "I've already written my prompt_template myself — it will be applied verbatim, so do NOT ask about message wording, format, tone, length, or content. " +
            "Use the placeholder text \"<USER PROVIDED — DO NOT CHANGE>\" as the prompt_template in your ready response. " +
            "Focus ONLY on schedule (cron_expr or fire_at), timezone, title, action, data_sources, and memory_enabled.",
        } as AuthorMsg,
        ...apiMessages,
      ];
    }

    // If we already have a draft, this turn is a refinement — use the draft as the baseline
    // the AI should modify. Otherwise fall back to props.existingJob (edit mode) or none.
    const effectiveExistingJob = draft ? jobFromDraft(draft) : existingJob;
    const result = await continueAuthoring(apiMessages, defaultTimezone, {
      existingJob: effectiveExistingJob,
      availableSources,
    });

    if (result.kind === "question") {
      setMessages((prev) => [...prev, { role: "assistant", content: result.question }]);
      setStage("talking");
    } else if (result.kind === "ready") {
      const finalDraft = pendingPromptOverride
        ? { ...result.draft, prompt_template: pendingPromptOverride }
        : result.draft;
      if (pendingPromptOverride) setPendingPromptOverride(null);
      setDraft(finalDraft);
      setStage("review");
    } else {
      setError(result.error);
      setStage("error");
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">▎{isEdit ? "EDIT AUTOMATION" : "NEW AUTOMATION"}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.slice(-8).map((m, i) => {
          const isUser = m.role === "user";
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text color={isUser ? "yellow" : "cyan"} bold>
                {isUser ? "Me" : "Leone"}
              </Text>
              <Box paddingLeft={2}>
                <Text>{m.content}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {stage === "thinking" && (
        <Box marginBottom={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text color="gray"> thinking...</Text>
        </Box>
      )}

      {stage === "testing" && (
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text color="gray"> running test (this sends a real Telegram message)...</Text>
          </Box>
          <Text color="gray" dimColor>{"  "}fetching sources · calling DeepSeek · sending</Text>
        </Box>
      )}

      {stage === "error" && error && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">! {error}</Text>
          <Text color="gray" dimColor>Type a message to try again, or Esc to cancel.</Text>
        </Box>
      )}

      {(stage === "talking" || stage === "error") && testResult && (
        <Box
          marginBottom={1}
          flexDirection="column"
          borderStyle="round"
          borderColor={testResult.ok ? "green" : "red"}
          paddingX={1}
        >
          <Text bold color={testResult.ok ? "green" : "red"}>
            {testResult.ok ? "✓ Test (current saved version)" : "✗ Test failed (current saved version)"}
          </Text>
          {testResult.steps.map((s, i) => (
            <Text key={i} color="gray">{"  "}{s}</Text>
          ))}
          {testResult.output && (
            <Box marginTop={1} flexDirection="column">
              <Text color="cyan">Message body:</Text>
              <Box paddingLeft={2}>
                <Text>{testResult.output}</Text>
              </Box>
            </Box>
          )}
          {testResult.error && <Text color="red">{"  "}Error: {testResult.error}</Text>}
        </Box>
      )}

      {(stage === "talking" || stage === "error") && (
        <InputBox
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={
            draft
              ? "Tell me what to tweak (e.g. 'don't say Bukit Jalil')..."
              : isEdit
              ? "What should change?"
              : "Describe your automation..."
          }
          hint={
            draft
              ? "Enter send · /promptfile <path> load prompt from file · Esc cancel"
              : isEdit
              ? "Enter send · Ctrl+T test saved · /promptfile <path> · Esc cancel"
              : "Enter send · /promptfile <path> load prompt from file · Esc cancel"
          }
        />
      )}

      {stage === "review" && draft && (
        <Box flexDirection="column">
          <Text color="green" bold>{isEdit ? "Updated automation:" : "Parsed automation:"}</Text>
          <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
            <Text><Text color="cyan">title    </Text> {draft.title}{draft.run_once ? <Text color="magenta" bold>  [ONE-OFF]</Text> : null}</Text>
            {draft.fire_at !== undefined ? (
              <Text><Text color="cyan">when     </Text> fires once at {new Date(draft.fire_at).toLocaleString()}  <Text color="gray">({draft.timezone})</Text></Text>
            ) : (
              <Text><Text color="cyan">when     </Text> {draft.cron_expr}  <Text color="gray">({draft.timezone})</Text></Text>
            )}
            <Text><Text color="cyan">action   </Text> {draft.action.type}</Text>
            <Text>
              <Text color="cyan">memory   </Text>
              {draft.memory_enabled
                ? <Text color="green">on — remembers your Telegram replies and compacts automatically</Text>
                : <Text color="gray">off</Text>}
            </Text>
            <Text>
              <Text color="cyan">sources  </Text>
              {(draft.data_sources && draft.data_sources.length > 0)
                ? <Text color="green">{draft.data_sources.join(", ")}</Text>
                : <Text color="gray">none</Text>}
            </Text>
            <Box flexDirection="column" marginTop={1}>
              <Text color="cyan">prompt</Text>
              <Box paddingLeft={2}>
                <Text>{draft.prompt_template}</Text>
              </Box>
            </Box>
          </Box>
          {testResult && (
            <Box
              marginTop={1}
              flexDirection="column"
              borderStyle="round"
              borderColor={testResult.ok ? "green" : "red"}
              paddingX={1}
            >
              <Text bold color={testResult.ok ? "green" : "red"}>
                {testResult.ok ? `✓ Test sent to Telegram (${isEdit ? "edited" : "new"} draft)` : "✗ Test failed"}
              </Text>
              {testResult.steps.map((s, i) => (
                <Text key={i} color="gray">{"  "}{s}</Text>
              ))}
              {testResult.output && (
                <Box marginTop={1} flexDirection="column">
                  <Text color="cyan">Message body:</Text>
                  <Box paddingLeft={2}>
                    <Text>{testResult.output}</Text>
                  </Box>
                </Box>
              )}
              {testResult.error && (
                <Text color="red">{"  "}Error: {testResult.error}</Text>
              )}
            </Box>
          )}

          <Box marginTop={1}>
            <Text color="gray">
              <Text color="green">[S]</Text>/<Text color="green">Enter</Text> save  ·  <Text color="cyan">[T]</Text> test run  ·  <Text color="magenta">[E]</Text> follow-up tweak  ·  <Text color="yellow">[R]</Text> start over  ·  Esc cancel
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
