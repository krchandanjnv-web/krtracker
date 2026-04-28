"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  Target,
  UserCircle2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import clsx from "clsx";
import {
  buildDailyChart,
  buildKpis,
  buildMonthlyChart,
  buildPlannerTask,
  buildTaskTypeChart,
  buildTaskWiseProgress,
  getDefaultDateRange,
  getTaskDisplayDate,
  isDateInRange,
  isTaskScheduledForDay,
  isRecurringDailyTask
} from "@/lib/metrics";
import { exportTasksPdf } from "@/lib/pdf";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DateRange, PlannerTask, ProfileRow, TaskFormState, TaskRow, TaskKind } from "@/lib/types";

type SessionUser = {
  id: string;
  email?: string;
};

type AuthMode = "login" | "signup";
type ActiveTab = "planner" | "insights" | "profile";

const emptyTaskForm: TaskFormState = {
  title: "",
  details: "",
  category: "",
  kind: "daily",
  taskDate: format(new Date(), "yyyy-MM-dd"),
  dueDate: format(new Date(), "yyyy-MM-dd"),
  targetPerWeek: 5,
  recurrenceDays: "none"
};

const typeColors = ["#1b4d3e", "#e78a2d", "#3f7dff"];

export function TrackerApp() {
  const supabase = getSupabaseBrowserClient();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeTab, setActiveTab] = useState<ActiveTab>("planner");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [networkError, setNetworkError] = useState<string>("");
  const [authForm, setAuthForm] = useState({
    username: "",
    email: "",
    password: ""
  });
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    const init = async () => {
      try {
        setNetworkError("");
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const currentUser = session?.user;

        if (!active) return;

        if (currentUser) {
          const nextUser = {
            id: currentUser.id,
            email: currentUser.email
          };
          setUser(nextUser);
          await ensureProfile(nextUser, currentUser.user_metadata?.username);
          await loadProfileAndTasks(currentUser.id);
        }
      } catch {
        if (!active) return;
        setNetworkError("Could not connect to Supabase. Please refresh and try again.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user;

      try {
        setNetworkError("");

        if (currentUser) {
          const nextUser = {
            id: currentUser.id,
            email: currentUser.email
          };
          setUser(nextUser);
          await ensureProfile(nextUser, currentUser.user_metadata?.username);
          await loadProfileAndTasks(currentUser.id);
        } else {
          setUser(null);
          setProfile(null);
          setTasks([]);
        }
      } catch {
        setNetworkError("Session updated, but data could not be loaded. Please refresh.");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function loadProfileAndTasks(userId: string) {
    if (!supabase) return;

    const [{ data: profileData, error: profileError }, { data: taskData, error: taskError }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false })
    ]);

    if (profileError) {
      throw profileError;
    }

    if (taskError) {
      throw taskError;
    }

    setProfile(profileData ?? null);
    setTasks(taskData ?? []);
  }

  async function ensureProfile(currentUser: SessionUser, usernameHint?: string) {
    if (!supabase) return null;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (existingProfile) {
      return existingProfile;
    }

    const fallbackUsername =
      usernameHint?.trim() ||
      currentUser.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_") ||
      `user_${currentUser.id.slice(0, 8)}`;

    const { data: createdProfile, error } = await supabase
      .from("profiles")
      .upsert({
        id: currentUser.id,
        email: currentUser.email ?? "",
        username: fallbackUsername
      })
      .select()
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return null;
    }

    return createdProfile;
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setMessage("");

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password,
        options: {
          data: {
            username: authForm.username
          }
        }
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.user) {
        await ensureProfile(
          {
            id: data.user.id,
            email: authForm.email
          },
          authForm.username
        );
      }

      setMessage("Account created. Check your email if confirmation is enabled.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email,
      password: authForm.password
    });

    setMessage(error ? error.message : "Logged in successfully.");
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;

    const payload = {
      user_id: user.id,
      title: taskForm.title,
      details: taskForm.details || null,
      category: taskForm.category || null,
      kind: taskForm.kind,
      task_date: taskForm.kind === "upcoming" ? null : taskForm.taskDate,
      due_date: taskForm.kind !== "daily" ? taskForm.dueDate : null,
      target_per_week: taskForm.kind === "habit" ? taskForm.targetPerWeek : null
      ,
      recurrence_days:
        taskForm.kind === "daily" && taskForm.recurrenceDays !== "none"
          ? Number(taskForm.recurrenceDays)
          : null,
      completion_dates: []
    };

    const { error } = await supabase.from("tasks").insert(payload);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTaskForm(emptyTaskForm);
    setMessage("Task added.");
    await loadProfileAndTasks(user.id);
  }

  async function toggleTask(task: TaskRow) {
    if (!supabase || !user) return;

    startTransition(async () => {
      const todayText = format(new Date(), "yyyy-MM-dd");
      const updates = isRecurringDailyTask(task)
        ? {
            completion_dates: task.completion_dates?.includes(todayText)
              ? task.completion_dates.filter((value) => value !== todayText)
              : [...(task.completion_dates ?? []), todayText]
          }
        : {
            completed_at: task.completed_at ? null : new Date().toISOString()
          };

      const { error } = await supabase.from("tasks").update(updates).eq("id", task.id).eq("user_id", user.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadProfileAndTasks(user.id);
    });
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  const filteredExportTasks = useMemo(() => {
    const from = parseISO(dateRange.from);
    const to = parseISO(dateRange.to);

    return tasks.filter((task) => {
      const checkDate = getTaskDisplayDate(task) ?? task.created_at;
      return isDateInRange(checkDate, from, to);
    });
  }, [dateRange, tasks]);
  const filteredExportPlannerTasks = useMemo(
    () => filteredExportTasks.map(buildPlannerTask).sort(sortPlannerTasks),
    [filteredExportTasks]
  );

  const kpis = useMemo(() => buildKpis(tasks), [tasks]);
  const dailyChart = useMemo(() => buildDailyChart(tasks), [tasks]);
  const monthlyChart = useMemo(() => buildMonthlyChart(tasks), [tasks]);
  const taskTypeChart = useMemo(() => buildTaskTypeChart(tasks), [tasks]);
  const taskWiseProgress = useMemo(() => buildTaskWiseProgress(tasks), [tasks]);

  const plannerGroups = useMemo(() => {
    const today = new Date();
    const todayText = format(today, "yyyy-MM-dd");
    const enriched = tasks.map(buildPlannerTask);

    return {
      daily: enriched
        .filter((task) =>
          task.kind === "daily" &&
          (task.recurrence_days
            ? task.cadenceLabel && isTaskVisibleToday(task)
            : task.task_date === todayText)
        )
        .sort(sortPlannerTasks),
      habits: enriched.filter((task) => task.kind === "habit").sort(sortPlannerTasks),
      upcoming: enriched.filter((task) => task.kind === "upcoming").sort(sortPlannerTasks),
      todayCount: enriched.filter((task) =>
        task.kind === "daily"
          ? task.recurrence_days
            ? isTaskVisibleToday(task)
            : task.task_date === todayText
          : task.kind === "habit"
            ? task.task_date === todayText
            : false
      ).length
    };
  }, [tasks]);

  if (!supabase) {
    return (
      <main className="page-shell">
        <section className="setup-card">
          <p className="eyebrow">Setup required</p>
          <h1>Connect Supabase to start using the tracker.</h1>
          <p>
            Add the Supabase URL and anon key to <code>.env.local</code>, then run the SQL from{" "}
            <code>supabase/schema.sql</code>.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page-shell loading-shell">
        <div className="loading-stack">
          <LoaderCircle className="spin" />
          {networkError ? <p className="form-message">{networkError}</p> : null}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-shell auth-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Daily Tracker</p>
            <h1>Plan today, keep habits alive, and see your progress clearly.</h1>
            <p>
              This app keeps your tasks synced across devices with Supabase, gives you clean progress views,
              and lets you export your history to PDF whenever you need it.
            </p>
          </div>
          <div className="hero-grid">
            <div className="mini-stat">
              <span>Planner</span>
              <strong>Daily + habits + upcoming</strong>
            </div>
            <div className="mini-stat">
              <span>Insights</span>
              <strong>KPIs, daily charts, monthly trends</strong>
            </div>
            <div className="mini-stat">
              <span>Profile</span>
              <strong>PDF exports and synced account</strong>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="tab-strip compact">
            <button
              className={clsx("tab-button", authMode === "login" && "active")}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={clsx("tab-button", authMode === "signup" && "active")}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" ? (
              <label>
                Username
                <input
                  value={authForm.username}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                  placeholder="your name"
                  required
                />
              </label>
            ) : null}
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="minimum 6 characters"
                required
              />
            </label>
            <button className="primary-button" type="submit">
              <ChevronRight size={16} />
              {authMode === "login" ? "Enter workspace" : "Create account"}
            </button>
          </form>
          {networkError ? <p className="form-message">{networkError}</p> : null}
          {message ? <p className="form-message">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>{profile?.username ?? user.email ?? "Daily Tracker"}</h1>
        </div>
        <div className="topbar-actions">
          <div className="topbar-chip">
            <CalendarDays size={16} />
            <span>{plannerGroups.todayCount} items scheduled today</span>
          </div>
          <button className="ghost-button" onClick={logout} type="button">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <nav className="tab-strip">
        <TabButton
          active={activeTab === "planner"}
          icon={<Target size={16} />}
          label="Planner"
          onClick={() => setActiveTab("planner")}
        />
        <TabButton
          active={activeTab === "insights"}
          icon={<LayoutDashboard size={16} />}
          label="Insights"
          onClick={() => setActiveTab("insights")}
        />
        <TabButton
          active={activeTab === "profile"}
          icon={<UserCircle2 size={16} />}
          label="Profile"
          onClick={() => setActiveTab("profile")}
        />
      </nav>

      {activeTab === "planner" ? (
        <section className="content-grid planner-grid">
          <article className="panel form-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">New task</p>
                <h2>Add daily, habit, or upcoming work</h2>
              </div>
              <Plus size={18} />
            </div>
            <form className="task-form" onSubmit={handleCreateTask}>
              <label>
                Task title
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Morning walk, client follow-up, study session"
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Category
                  <input
                    value={taskForm.category}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Health, Work, Learning"
                  />
                </label>
                <label>
                  Type
                  <select
                    value={taskForm.kind}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, kind: event.target.value as TaskKind }))
                    }
                  >
                    <option value="daily">Daily task</option>
                    <option value="habit">Daily habit</option>
                    <option value="upcoming">Upcoming task</option>
                  </select>
                </label>
              </div>
              <label>
                Notes
                <textarea
                  value={taskForm.details}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, details: event.target.value }))}
                  placeholder="Optional notes or details"
                  rows={3}
                />
              </label>
              <div className="form-grid">
                <label>
                  Task date
                  <input
                    type="date"
                    value={taskForm.taskDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, taskDate: event.target.value }))}
                    disabled={taskForm.kind === "upcoming"}
                  />
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    disabled={taskForm.kind === "daily"}
                  />
                </label>
              </div>
              {taskForm.kind === "daily" ? (
                <label>
                  Repeat schedule
                  <select
                    value={taskForm.recurrenceDays}
                    onChange={(event) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        recurrenceDays: event.target.value as TaskFormState["recurrenceDays"]
                      }))
                    }
                  >
                    <option value="none">One manual daily task</option>
                    <option value="5">Mon to Fri auto-refresh</option>
                    <option value="6">Mon to Sat auto-refresh</option>
                    <option value="7">Mon to Sun auto-refresh</option>
                  </select>
                </label>
              ) : null}
              {taskForm.kind === "habit" ? (
                <label>
                  Habit target per week
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={taskForm.targetPerWeek}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, targetPerWeek: Number(event.target.value) }))
                    }
                  />
                </label>
              ) : null}
              <button className="primary-button" type="submit">
                <Plus size={16} />
                Save task
              </button>
            </form>
          </article>

          <article className="panel table-panel">
            <SectionTitle title="Daily tasks" subtitle="Manual one-day items plus weekday-based auto-refresh routines." />
            <TaskTable tasks={plannerGroups.daily} onToggle={toggleTask} pending={pending} />
          </article>

          <article className="panel table-panel">
            <SectionTitle title="Habit list" subtitle="Repeatable items you want to keep consistent." />
            <TaskTable tasks={plannerGroups.habits} onToggle={toggleTask} pending={pending} />
          </article>

          <article className="panel table-panel">
            <SectionTitle title="Upcoming tasks" subtitle="Future work with due dates and a live days-left count." />
            <TaskTable tasks={plannerGroups.upcoming} onToggle={toggleTask} pending={pending} />
          </article>
        </section>
      ) : null}

      {activeTab === "insights" ? (
        <section className="insights-stack">
          <div className="kpi-grid">
            {kpis.map((item) => (
              <article className="kpi-card" key={item.label}>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.hint}</span>
              </article>
            ))}
          </div>

          <div className="chart-grid">
            <article className="panel chart-panel">
              <SectionTitle title="Daily progress" subtitle="Past 7 days planned vs completed." />
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="planned" fill="#d4dfda" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="done" fill="#1b4d3e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel chart-panel">
              <SectionTitle title="Monthly trend" subtitle="Completions across the current month." />
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="completed" stroke="#e78a2d" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel chart-panel">
              <SectionTitle title="Task mix" subtitle="How your workload is distributed." />
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskTypeChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {taskTypeChart.map((entry, index) => (
                        <Cell key={entry.name} fill={typeColors[index % typeColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel chart-panel">
              <SectionTitle title="Task-wise progress" subtitle="A quick view of the latest task statuses." />
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskWiseProgress} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip />
                    <Bar dataKey="status" fill="#3f7dff" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeTab === "profile" ? (
        <section className="content-grid profile-grid">
          <article className="panel profile-panel">
            <SectionTitle title="Profile" subtitle="Account details for synced access across devices." />
            <div className="profile-card">
              <div>
                <span>Username</span>
                <strong>{profile?.username ?? "Not set"}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{profile?.email ?? user.email ?? "Not set"}</strong>
              </div>
              <div>
                <span>Joined</span>
                <strong>{profile?.created_at ? format(parseISO(profile.created_at), "dd MMM yyyy") : "-"}</strong>
              </div>
            </div>
          </article>

          <article className="panel export-panel">
            <SectionTitle title="Export to PDF" subtitle="Choose a date range and download your records." />
            <div className="form-grid">
              <label>
                From
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => setDateRange((prev) => ({ ...prev, from: event.target.value }))}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(event) => setDateRange((prev) => ({ ...prev, to: event.target.value }))}
                />
              </label>
            </div>
            <div className="export-summary">
              <p>{filteredExportTasks.length} rows ready for export</p>
              <button
                className="primary-button"
                onClick={() => exportTasksPdf(profile, filteredExportTasks, dateRange)}
                type="button"
              >
                <Download size={16} />
                Export PDF
              </button>
            </div>
          </article>

          <article className="panel table-panel full-width">
            <SectionTitle title="Export preview" subtitle="The rows that will be included in your PDF file." />
            <TaskTable tasks={filteredExportPlannerTasks} onToggle={toggleTask} pending={pending} />
          </article>
        </section>
      ) : null}

      {networkError ? <div className="status-toast">{networkError}</div> : null}
      {!networkError && message ? <div className="status-toast">{message}</div> : null}
    </main>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={clsx("tab-button", active && "active")} onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function TaskTable({
  tasks,
  onToggle,
  pending
}: {
  tasks: PlannerTask[];
  onToggle: (task: TaskRow) => void;
  pending: boolean;
}) {
  if (!tasks.length) {
    return <div className="empty-state">No tasks here yet.</div>;
  }

  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Type</th>
            <th>Date</th>
            <th>Pattern</th>
            <th>Category</th>
            <th>Days left</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <button className="check-button" onClick={() => onToggle(task)} type="button" disabled={pending}>
                  <CheckCircle2 size={18} className={task.completed_at ? "done-icon" : ""} />
                </button>
                <div className="task-copy">
                  <strong>{task.title}</strong>
                  <span>{task.details || "No extra notes"}</span>
                </div>
              </td>
              <td>{task.kind}</td>
              <td>{formatTaskDate(task)}</td>
              <td>{task.cadenceLabel ?? "-"}</td>
              <td>{task.category ?? "-"}</td>
              <td>{formatDaysLeft(task.daysLeft)}</td>
              <td>
                <span className={clsx("status-pill", task.isDoneToday || task.completed_at ? "done" : "pending")}>
                  {task.isDoneToday || task.completed_at ? "Done" : "Pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTaskDate(task: PlannerTask) {
  const value = task.displayDate;
  return value ? format(parseISO(value), "dd MMM yyyy") : "-";
}

function sortPlannerTasks(a: PlannerTask, b: PlannerTask) {
  const left = a.displayDate ?? a.created_at;
  const right = b.displayDate ?? b.created_at;
  return parseISO(left).getTime() - parseISO(right).getTime();
}

function formatDaysLeft(daysLeft: number | null) {
  if (daysLeft === null) {
    return "-";
  }

  if (daysLeft < 0) {
    return `${Math.abs(daysLeft)} overdue`;
  }

  if (daysLeft === 0) {
    return "Today";
  }

  if (daysLeft === 1) {
    return "1 day";
  }

  return `${daysLeft} days`;
}

function isTaskVisibleToday(task: PlannerTask) {
  return isTaskScheduledForDay(task, new Date());
}
