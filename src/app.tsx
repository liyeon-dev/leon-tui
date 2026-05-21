import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Banner } from "./components/Banner.js";
import { Home } from "./views/Home.js";
import { ChatList } from "./views/ChatList.js";
import { Chat } from "./views/Chat.js";
import { Jobs } from "./views/Jobs.js";
import { NewJob } from "./views/NewJob.js";
import { Tasks } from "./views/Tasks.js";
import { TaskForm } from "./views/TaskForm.js";
import { Categories } from "./views/Categories.js";
import { loadSessions, saveSessions, createSession } from "./store/sessions.js";
import { loadJobs, saveJobs } from "./store/jobs.js";
import { loadSources, ensureDefaultSources } from "./store/sources.js";
import { loadTasks, saveTasks } from "./store/tasks.js";
import { loadCategories, saveCategories, ensureDefaultCategories, newCategory } from "./store/taskCategories.js";
import { syncAll, register, unregister, activeCount, shutdown } from "./scheduler/runner.js";
import { onActivity } from "./scheduler/execute.js";
import { startPolling, stopPolling, onInbox } from "./services/telegram-poll.js";
import { startReminderScan, stopReminderScan } from "./scheduler/taskReminders.js";
import type { Session, Job, View, LogEntry, DataSource, Task, TaskCategory } from "./types.js";

const DEFAULT_TZ = process.env.LEON_TIMEZONE || "Asia/Kuala_Lumpur";

export function App() {
  const { exit } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

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
        await ensureDefaultCategories().catch(() => undefined);
        const s = await loadSessions().catch(() => [] as Session[]);
        const j = await loadJobs().catch(() => [] as Job[]);
        const ds = await loadSources().catch(() => [] as DataSource[]);
        const t = await loadTasks().catch(() => [] as Task[]);
        const c = await loadCategories().catch(() => [] as TaskCategory[]);
        setSessions(s);
        setJobs(j);
        setSources(ds);
        setTasks(t);
        setCategories(c);
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
    startReminderScan();
    return () => { off(); offInbox(); stopPolling(); stopReminderScan(); shutdown(); };
  }, []);

  useEffect(() => { if (loaded) void saveSessions(sessions); }, [sessions, loaded]);
  useEffect(() => { if (loaded) void saveJobs(jobs); }, [jobs, loaded]);
  useEffect(() => { if (loaded) void saveTasks(tasks); }, [tasks, loaded]);
  useEffect(() => { if (loaded) void saveCategories(categories); }, [categories, loaded]);

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
  const editingTask = tasks.find((t) => t.id === editingTaskId) ?? null;

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

  function handleHomePick(choice: "chat" | "automations" | "tasks") {
    if (choice === "chat") push("chatList");
    else if (choice === "tasks") push("tasks");
    else push("jobs");
  }

  function saveTask(task: Task) {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      if (exists) return prev.map((t) => (t.id === task.id ? task : t));
      return [...prev, task];
    });
    setEditingTaskId(null);
    pop();
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function startEditTask(id: string) {
    setEditingTaskId(id);
    push("edittask");
  }

  function startNewTask() {
    setEditingTaskId(null);
    push("newtask");
  }

  function addCategory(name: string) {
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, newCategory(name)];
    });
  }

  function deleteCategory(name: string) {
    setCategories((prev) => prev.filter((c) => c.name !== name));
  }

  return (
    <Box flexDirection="column">
      <Banner subtitle={`${timerCount} timer${timerCount === 1 ? "" : "s"} running`} />

      <Box flexDirection="column" paddingX={2} flexGrow={1}>
        {view === "home" && (
          <Home jobs={jobs} tasks={tasks} activity={activity} activeTimers={timerCount} onPick={handleHomePick} />
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
        {view === "tasks" && (
          <Tasks
            tasks={tasks}
            onCreate={startNewTask}
            onEdit={startEditTask}
            onDelete={deleteTask}
            onManageCategories={() => push("categories")}
          />
        )}
        {view === "newtask" && (
          <TaskForm categories={categories} onSave={saveTask} onCancel={pop} />
        )}
        {view === "edittask" && editingTask && (
          <TaskForm categories={categories} existingTask={editingTask} onSave={saveTask} onCancel={pop} />
        )}
        {view === "edittask" && !editingTask && (
          <Text color="red">Task not found. Press Esc to go back.</Text>
        )}
        {view === "categories" && (
          <Categories
            categories={categories}
            onAdd={addCategory}
            onDelete={deleteCategory}
            onBack={pop}
          />
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
