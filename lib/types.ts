export type TaskKind = "daily" | "habit" | "upcoming";
export type TaskStatus = "pending" | "done" | "missed";

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  details: string | null;
  category: string | null;
  kind: TaskKind;
  task_date: string | null;
  due_date: string | null;
  target_per_week: number | null;
  recurrence_days: number | null;
  completion_dates: string[] | null;
  completed_at: string | null;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  email: string;
  username: string;
  created_at: string;
};

export type TaskFormState = {
  title: string;
  details: string;
  category: string;
  kind: TaskKind;
  taskDate: string;
  dueDate: string;
  targetPerWeek: number;
  recurrenceDays: "none" | "5" | "6" | "7";
};

export type PlannerTask = TaskRow & {
  displayDate: string | null;
  isDoneToday: boolean;
  daysLeft: number | null;
  cadenceLabel: string | null;
};

export type DateRange = {
  from: string;
  to: string;
};

export type KPIItem = {
  label: string;
  value: string;
  hint: string;
};
