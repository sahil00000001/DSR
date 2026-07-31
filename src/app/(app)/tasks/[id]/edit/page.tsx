import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getDependencyCandidates, getTask, getTaskOptions } from "@/lib/services/tasks";
import { listEmployees } from "@/lib/services/people";
import { isStorageConfigured } from "@/lib/storage/supabase-storage";
import { toDayKey } from "@/lib/utils/date";
import { TaskForm } from "@/components/tasks/task-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  // Editing is admin-only, so there is nothing to leak to anyone else.
  if (!can.editTask(user)) return { title: "Task not found" };

  const task = await getTask(id);
  return { title: task ? `Edit ${task.taskNumber}` : "Task not found" };
}

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  if (!can.editTask(user)) redirect("/forbidden");

  const task = await getTask(id);
  if (!task) notFound();

  const [employees, taskOptions, candidates] = await Promise.all([
    listEmployees({ status: ["ACTIVE"] }, user),
    getTaskOptions(),
    getDependencyCandidates(task.id, user),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Tasks", href: "/tasks" },
          { label: task.taskNumber, href: `/tasks/${task.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${task.taskNumber}`}
        description="Anyone newly assigned is emailed; a changed due date notifies everyone on the task and resets the reminder."
      />

      <div className="max-w-4xl">
        <TaskForm
          existing={{
            id: task.id,
            taskNumber: task.taskNumber,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            categoryId: task.category?.id ?? null,
            dueOn: task.dueOn ? toDayKey(task.dueOn) : null,
            // Rendered back in IST, matching how the form reads it in.
            deadlineTime: task.deadlineAt
              ? task.deadlineAt.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                })
              : null,
            estimateHours: task.estimateMinutes
              ? String(Math.round((task.estimateMinutes / 60) * 100) / 100)
              : null,
            blockedReason: task.blockedReason,
            recurrence: task.recurrence,
            recurrenceEvery: task.recurrenceEvery,
            recurrenceUntil: null,
            assigneeIds: task.assignees.map((person) => person.id),
            tagIds: task.tags.map((tag) => tag.id),
          }}
          people={employees.map((employee) => ({
            id: employee.id,
            name: employee.name,
            avatarUrl: employee.avatarUrl,
            designation: employee.designation,
            department: employee.department?.name ?? null,
          }))}
          categories={taskOptions.categories}
          tags={taskOptions.tags}
          dependencyCandidates={candidates}
          storageReady={isStorageConfigured()}
        />
      </div>
    </>
  );
}
