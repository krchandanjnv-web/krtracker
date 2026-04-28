import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import type { DateRange, ProfileRow, TaskRow } from "@/lib/types";

export function exportTasksPdf(profile: ProfileRow | null, tasks: TaskRow[], range: DateRange) {
  const doc = new jsPDF();
  const heading = profile ? `${profile.username}'s Daily Tracker` : "Daily Tracker Export";

  doc.setFontSize(18);
  doc.text(heading, 14, 18);
  doc.setFontSize(11);
  doc.text(`Range: ${range.from} to ${range.to}`, 14, 26);
  doc.text(`Rows exported: ${tasks.length}`, 14, 32);

  autoTable(doc, {
    startY: 40,
    head: [["Task", "Type", "Category", "Scheduled", "Due", "Status"]],
    body: tasks.map((task) => [
      task.title,
      task.kind,
      task.category ?? "-",
      task.task_date ? format(parseISO(task.task_date), "dd MMM yyyy") : "-",
      task.due_date ? format(parseISO(task.due_date), "dd MMM yyyy") : "-",
      task.completed_at ? "Done" : "Pending"
    ]),
    styles: {
      fontSize: 9
    },
    headStyles: {
      fillColor: [27, 77, 62]
    }
  });

  doc.save(`daily-tracker-${range.from}-to-${range.to}.pdf`);
}
