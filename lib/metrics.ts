import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfMonth,
  subDays
} from "date-fns";
import type { KPIItem, TaskRow } from "@/lib/types";

function isCompleted(task: TaskRow) {
  return Boolean(task.completed_at);
}

function inRange(dateText: string | null, from: Date, to: Date) {
  if (!dateText) return false;
  const date = parseISO(dateText);
  return !isBefore(date, from) && !isAfter(date, to);
}

export function buildKpis(tasks: TaskRow[]) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const last7 = subDays(today, 6);

  const completed = tasks.filter(isCompleted).length;
  const todayTasks = tasks.filter((task) => {
    const dateValue = task.task_date ?? task.due_date;
    return dateValue ? isSameDay(parseISO(dateValue), today) : false;
  });
  const dueTodayDone = todayTasks.filter(isCompleted).length;

  const monthTasks = tasks.filter((task) =>
    inRange(task.task_date ?? task.due_date, monthStart, monthEnd)
  );
  const monthDone = monthTasks.filter(isCompleted).length;
  const habitTasks = tasks.filter((task) => task.kind === "habit");
  const habitDone = habitTasks.filter(isCompleted).length;
  const weekTasks = tasks.filter((task) => inRange(task.task_date ?? task.due_date, last7, today));
  const weekDone = weekTasks.filter(isCompleted).length;

  const percent = (done: number, total: number) =>
    total ? `${Math.round((done / total) * 100)}%` : "0%";

  const items: KPIItem[] = [
    {
      label: "Today focus",
      value: `${dueTodayDone}/${todayTasks.length || 0}`,
      hint: "Completed tasks scheduled for today"
    },
    {
      label: "7 day win rate",
      value: percent(weekDone, weekTasks.length),
      hint: "Daily and upcoming tasks finished this week"
    },
    {
      label: "Monthly completion",
      value: percent(monthDone, monthTasks.length),
      hint: "How much of this month you closed out"
    },
    {
      label: "Habit momentum",
      value: percent(habitDone, habitTasks.length),
      hint: "Current completion rate across habits"
    },
    {
      label: "Total completed",
      value: `${completed}`,
      hint: "All finished tasks in your account"
    }
  ];

  return items;
}

export function buildDailyChart(tasks: TaskRow[]) {
  const days = eachDayOfInterval({
    start: subDays(new Date(), 6),
    end: new Date()
  });

  return days.map((day) => {
    const label = format(day, "EEE");
    const related = tasks.filter((task) => {
      const dateValue = task.task_date ?? task.due_date;
      return dateValue ? isSameDay(parseISO(dateValue), day) : false;
    });

    return {
      label,
      planned: related.length,
      done: related.filter(isCompleted).length
    };
  });
}

export function buildMonthlyChart(tasks: TaskRow[]) {
  const start = startOfMonth(new Date());
  const end = endOfMonth(new Date());
  const days = eachDayOfInterval({ start, end });

  return days.map((day) => {
    const related = tasks.filter((task) => {
      const dateValue = task.task_date ?? task.due_date;
      return dateValue ? isSameDay(parseISO(dateValue), day) : false;
    });

    return {
      day: format(day, "d"),
      completed: related.filter(isCompleted).length
    };
  });
}

export function buildTaskTypeChart(tasks: TaskRow[]) {
  return [
    { name: "Daily", value: tasks.filter((task) => task.kind === "daily").length },
    { name: "Habit", value: tasks.filter((task) => task.kind === "habit").length },
    { name: "Upcoming", value: tasks.filter((task) => task.kind === "upcoming").length }
  ];
}

export function buildTaskWiseProgress(tasks: TaskRow[]) {
  return tasks
    .slice()
    .sort((a, b) => {
      const aDate = a.task_date ?? a.due_date ?? a.created_at;
      const bDate = b.task_date ?? b.due_date ?? b.created_at;
      return parseISO(bDate).getTime() - parseISO(aDate).getTime();
    })
    .slice(0, 8)
    .map((task) => ({
      name: task.title,
      status: isCompleted(task) ? 100 : 20,
      type: task.kind
    }));
}

export function getDefaultDateRange() {
  const today = new Date();
  return {
    from: format(subDays(today, 29), "yyyy-MM-dd"),
    to: format(addDays(today, 1), "yyyy-MM-dd")
  };
}
