import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getDependencyCandidates, getTaskOptions } from "@/lib/services/tasks";
import { listEmployees } from "@/lib/services/people";
import { isStorageConfigured } from "@/lib/storage/supabase-storage";
import { TaskForm } from "@/components/tasks/task-form";

export const metadata: Metadata = {
  title: "New task",
  description: "Create and assign a task.",
};

export default async function NewTaskPage() {
  const user = await requireUser();
  if (!can.createTask(user)) redirect("/forbidden");

  const [employees, taskOptions, candidates] = await Promise.all([
    listEmployees({ status: ["ACTIVE"] }, user),
    getTaskOptions(),
    getDependencyCandidates(null, user),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Tasks", href: "/tasks" }, { label: "New task" }]}
        title="Create a task"
        description="Everyone assigned gets an email with the full description and a link straight to it."
      />

      <div className="max-w-4xl">
        <TaskForm
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
