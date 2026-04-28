import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfMonth,
  subDays
} from "date-fns";
import type { KPIItem, PlannerTask, TaskRow } from "@/lib/types";

const weekdayLabels: Record<number, string> = {
  5: "Mon-Fri",
  6: "Mon-Sat",
  7: "Mon-Sun"
};

function isWeekdayIncluded(date: Date, recurrenceDays: number | null) {
  const weekday = getDay(date);

  if (recurrenceDays === 5) {
    return weekday >= 1 && weekday <= 5;
  }

  if (recurrenceDays === 6) {
    return weekday >= 1 && weekday <= 6;
  }

  if (recurrenceDays === 7) {
    return true;
  }

  return false;
}

export function getTaskDisplayDate(task: TaskRow) {
  return task.task_date ?? task.due_date ?? null;
}

export function isRecurringDailyTask(task: TaskRow) {
  return task.kind === "daily" && Boolean(task.recurrence_days);
}

export function isTaskScheduledForDay(task: TaskRow, day: Date) {
  if (isRecurringDailyTask(task)) {
    const startsAt = task.task_date ? parseISO(task.task_date) : null;
    if (startsAt && isBefore(day, startsAt)) {
      return false;
    }

    return isWeekdayIncluded(day, task.recurrence_days);
  }

  const dateValue = getTaskDisplayDate(task);
  return dateValue ? isSameDay(parseISO(dateValue), day) : false;
}

export function isTaskDoneOnDay(task: TaskRow, day: Date) {
  if (isRecurringDailyTask(task)) {
    if (!isTaskScheduledForDay(task, day)) {
      return false;
    }

    return Boolean(task.completion_dates?.some((value) => isSameDay(parseISO(value), day)));
  }

  return Boolean(task.completed_at && isSameDay(parseISO(task.completed_at), day));
}

export function getCadenceLabel(task: TaskRow) {
  if (!isRecurringDailyTask(task)) {
    return null;
  }

  return weekdayLabels[task.recurrence_days as 5 | 6 | 7] ?? null;
}

export function getDaysLeft(task: TaskRow) {
  if (task.kind !== "upcoming" || !task.due_date) {
    return null;
  }

  return differenceInCalendarDays(parseISO(task.due_date), new Date());
}

export function buildPlannerTask(task: TaskRow): PlannerTask {
  return {
    ...task,
    displayDate: getTaskDisplayDate(task),
    isDoneToday: isTaskDoneOnDay(task, new Date()),
    daysLeft: getDaysLeft(task),
    cadenceLabel: getCadenceLabel(task)
  };
}

export function buildKpis(tasks: TaskRow[]) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const last7 = subDays(today, 6);

  const completed = tasks.reduce((sum, task) => {
    if (isRecurringDailyTask(task)) {
      return sum + (task.completion_dates?.length ?? 0);
    }

    return sum + (task.completed_at ? 1 : 0);
  }, 0);

  const todayTasks = tasks.filter((task) => isTaskScheduledForDay(task, today));
  const dueTodayDone = todayTasks.filter((task) => isTaskDoneOnDay(task, today)).length;

  const monthTaskDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).flatMap((day) =>
    tasks
      .filter((task) => isTaskScheduledForDay(task, day))
      .map((task) => ({ task, day }))
  );
  const monthDone = monthTaskDays.filter(({ task, day }) => isTaskDoneOnDay(task, day)).length;

  const habitTasks = tasks.filter((task) => task.kind === "habit");
  const habitDone = habitTasks.filter((task) => Boolean(task.completed_at)).length;

  const weekTaskDays = eachDayOfInterval({ start: last7, end: today }).flatMap((day) =>
    tasks
      .filter((task) => isTaskScheduledForDay(task, day))
      .map((task) => ({ task, day }))
  );
  const weekDone = weekTaskDays.filter(({ task, day }) => isTaskDoneOnDay(task, day)).length;

  const percent = (done: number, total: number) =>
    total ? `${Math.round((done / total) * 100)}%` : "0%";

  const items: KPIItem[] = [
    {
      label: "Today focus",
      value: `${dueTodayDone}/${todayTasks.length || 0}`,
      hint: "Completed tasks active for today"
    },
    {
      label: "7 day win rate",
      value: percent(weekDone, weekTaskDays.length),
      hint: "Daily and upcoming work finished this week"
    },
    {
      label: "Monthly completion",
      value: percent(monthDone, monthTaskDays.length),
      hint: "How much of this month's schedule you closed"
    },
    {
      label: "Habit momentum",
      value: percent(habitDone, habitTasks.length),
      hint: "Current completion rate across habits"
    },
    {
      label: "Total completions",
      value: `${completed}`,
      hint: "Finished check-ins recorded in your account"
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
    const related = tasks.filter((task) => isTaskScheduledForDay(task, day));

    return {
      label: format(day, "EEE"),
      planned: related.length,
      done: related.filter((task) => isTaskDoneOnDay(task, day)).length
    };
  });
}

export function buildMonthlyChart(tasks: TaskRow[]) {
  const start = startOfMonth(new Date());
  const end = endOfMonth(new Date());
  const days = eachDayOfInterval({ start, end });

  return days.map((day) => {
    const related = tasks.filter((task) => isTaskScheduledForDay(task, day));

    return {
      day: format(day, "d"),
      completed: related.filter((task) => isTaskDoneOnDay(task, day)).length
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
      const aDate = getTaskDisplayDate(a) ?? a.created_at;
      const bDate = getTaskDisplayDate(b) ?? b.created_at;
      return parseISO(bDate).getTime() - parseISO(aDate).getTime();
    })
    .slice(0, 8)
    .map((task) => ({
      name: task.title,
      status: task.kind === "daily" ? (isTaskDoneOnDay(task, new Date()) ? 100 : 20) : task.completed_at ? 100 : 20,
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

export function isDateInRange(dateText: string | null, from: Date, to: Date) {
  if (!dateText) return false;
  const date = parseISO(dateText);
  return !isBefore(date, from) && !isAfter(date, to);
}
