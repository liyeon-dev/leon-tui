import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Banner } from "./components/Banner.js";
import { Home } from "./views/Home.js";
import { ChatList } from "./views/ChatList.js";
import { Chat } from "./views/Chat.js";
import { Jobs } from "./views/Jobs.js";
import { NewJob } from "./views/NewJob.js";
import { loadSessions, saveSessions, createSession } from "./store/sessions.js";
import { loadJobs, saveJobs } from "./store/jobs.js";
import { loadSources, ensureDefaultSources } from "./store/sources.js";
import { syncAll, register, unregister, activeCount, shutdown } from "./scheduler/runner.js";
import { onActivity } from "./scheduler/execute.js";
import { startPolling, stopPolling, onInbox } from "./services/telegram-poll.js";
import type { Session, Job, View, LogEntry, DataSource } from "./types.js";

const DEFAULT_TZ = process.env.LEON_TIMEZONE || "Asia/Kuala_Lumpur";

export function App() {
  const { exit } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [activity, setActivity] = useState<LogEntry[]>([]);
  const [timerCount, setTimerCount] = useState(0);
  // Gate the save effects until boot has populated state from disk —
  // otherwise the initial `[]` values would wipe jobs.json / sessions.json.
  const [loaded, setLoaded] = useState(false);

  // View stack — top of stack is current view
  const [stack, setStack] = useState<View[]>(["home"]);
  const view: View = stack[stack.length - 1] ?? "home";

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  function clearTerminal() {
    // \x1b[2J = clear screen, \x1b[3J = clear scrollback, \x1b[H = cursor home
    try { process.stdout.write("\x1b[2J\x1b[3J\x1b[H"); } catch { /* ignore */ }
  }
  function push(v: View) { setStack((s) => [...s, v]); }
  function pop() {
    setStack((s) => {
      const next = s.length > 1 ? s.slice(0, -1) : s;
      if (next[next.length - 1] === "home") clearTerminal();
      return next;
    });
  }
  function goHome() { clearTerminal(); setStack(["home"]); }

  // Boot
  useEffect(() => {
    (async () => {
      try {
        await ensureDefaultSources().catch(() => undefined);
        const s = await loadSessions().catch(() => [] as Session[]);
        const j = await loadJobs().catch(() => [] as Job[]);
        const ds = await loadSources().catch(() => [] as DataSource[]);
        setSessions(s);
        setJobs(j);
        setSources(ds);
        syncAll(j);
        setTimerCount(activeCount());
        setLoaded(true);
      } catch (err) {
        setActivity((prev) => [...prev, { ts: Date.now(), level: "error", source: "boot", message: String(err) }]);
        // Don't flip `loaded` on failure — leaves disk state intact so the user can recover.
      }
    })();
    const off = onActivity((entry) => {
      setActivity((prev) => [...prev.slice(-50), entry]);
      loadJobs().then(setJobs).catch(() => undefined);
    });
    const offInbox = onInbox((msg) => {
      setActivity((prev) => [...prev.slice(-50), {
        ts: msg.ts,
        level: "info",
        source: "telegram",
        message: `inbox: "${msg.text.slice(0, 60)}${msg.text.length > 60 ? "..." : ""}"`,
      }]);
    });
    startPolling();
    return () => { off(); offInbox(); stopPolling(); shutdown(); };
  }, []);

  useEffect(() => { if (loaded) void saveSessions(sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) void saveJobs(jobs); }, [jobs, loaded]);

  // Global keys: just quit + back
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      shutdown();
      exit();
      return;
    }
    if (key.escape) {
      pop();
      return;
    }
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const editingJob = jobs.find((j) => j.id === editingJobId) ?? null;

  function updateSession(next: Session) {
    setSessions((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  }

  function openSession(id: string) {
    setActiveSessionId(id);
    push("chat");
  }

  function startNewChat() {
    const s = createSession();
    setSessions((prev) => [...prev, s]);
    setActiveSessionId(s.id);
    push("chat");
  }

  function toggleJob(id: string) {
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, enabled: !j.enabled } : j));
      const updated = next.find((j) => j.id === id);
      if (updated) {
        if (updated.enabled) register(updated);
        else unregister(updated.id);
        setTimerCount(activeCount());
      }
      return next;
    });
  }

  function deleteJob(id: string) {
    unregister(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setTimerCount(activeCount());
  }

  function saveJob(job: Job) {
    const exists = jobs.some((j) => j.id === job.id);
    if (exists) {
      unregister(job.id);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    } else {
      setJobs((prev) => [...prev, job]);
    }
    register(job);
    setTimerCount(activeCount());
    setEditingJobId(null);
    // Pop back to jobs view (NewJob/EditJob was pushed on top of it)
    pop();
  }

  function startEditJob(id: string) {
    setEditingJobId(id);
    push("editjob");
  }

  function startNewJob() {
    setEditingJobId(null);
    push("newjob");
  }

  function handleHomePick(choice: "chat" | "automations") {
    if (choice === "chat") push("chatList");
    else push("jobs");
  }

  return (
    <Box flexDirection="column">
      <Banner subtitle={`${timerCount} timer${timerCount === 1 ? "" : "s"} running`} />

      <Box flexDirection="column" paddingX={2} flexGrow={1}>
        {view === "home" && (
          <Home jobs={jobs} activity={activity} activeTimers={timerCount} onPick={handleHomePick} />
        )}
        {view === "chatList" && (
          <ChatList
            sessions={sessions}
            onNew={startNewChat}
            onOpen={openSession}
            onDelete={deleteSession}
          />
        )}
        {view === "chat" && activeSession && (
          <Chat session={activeSession} onUpdate={updateSession} />
        )}
        {view === "chat" && !activeSession && (
          <Text color="red">No session selected. Press Esc to go back.</Text>
        )}
        {view === "jobs" && (
          <Jobs
            jobs={jobs}
            onCreate={startNewJob}
            onEdit={startEditJob}
            onToggle={toggleJob}
            onDelete={deleteJob}
          />
        )}
        {view === "newjob" && (
          <NewJob defaultTimezone={DEFAULT_TZ} availableSources={sources} onSave={saveJob} onCancel={pop} />
        )}
        {view === "editjob" && editingJob && (
          <NewJob defaultTimezone={DEFAULT_TZ} availableSources={sources} existingJob={editingJob} onSave={saveJob} onCancel={pop} />
        )}
        {view === "editjob" && !editingJob && (
          <Text color="red">Job not found. Press Esc to go back.</Text>
        )}
      </Box>

      <Box marginTop={1} paddingX={2}>
        <Text color="gray" dimColor>
          ↑↓ select · Enter confirm · Esc back · Ctrl+C quit
        </Text>
      </Box>
    </Box>
  );
}
