"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Save, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/dropdown-menu";
import { usePopover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  createDepartmentAction,
  createTeamAction,
  deleteDepartmentAction,
  updateDepartmentAction,
} from "@/server/actions/organisation";
import { IDLE } from "@/server/actions/form-state";
import { DEPARTMENT_COLORS } from "@/lib/constants/enums";
import type { DepartmentDto, OrgOptions } from "@/types/org";

/**
 * Department administration.
 *
 * A single control that opens the three things an admin needs — new department,
 * edit an existing one, add a team — rather than scattering buttons through the
 * page. Deletion is guarded server-side (a department with people can't be
 * removed), and the confirmation says so up front rather than after the attempt.
 */
export function DepartmentAdmin({
  options,
  departments,
}: {
  options: OrgOptions;
  departments: DepartmentDto[];
}) {
  const { triggerProps, panelProps, close } = usePopover({ role: "menu" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DepartmentDto | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);

  return (
    <>
      <Button variant="primary" size="sm" {...triggerProps}>
        <Plus className="size-4" />
        Manage
      </Button>

      <DropdownMenu {...panelProps} align="end" className="w-[15rem]">
        <MenuItem
          onClick={() => {
            close();
            setCreating(true);
          }}
        >
          <Building2 />
          New department
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            setAddingTeam(true);
          }}
          disabled={departments.length === 0}
        >
          <Users />
          New team
        </MenuItem>

        {departments.length > 0 ? (
          <>
            <MenuLabel>Edit department</MenuLabel>
            {departments.map((department) => (
              <MenuItem
                key={department.id}
                onClick={() => {
                  close();
                  setEditing(department);
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--cat-${department.color})` }}
                />
                {department.name}
              </MenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenu>

      <DepartmentDialog
        open={creating}
        onClose={() => setCreating(false)}
        options={options}
      />
      <DepartmentDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        options={options}
        department={editing}
      />
      <TeamDialog
        open={addingTeam}
        onClose={() => setAddingTeam(false)}
        departments={departments}
      />
    </>
  );
}

function DepartmentDialog({
  open,
  onClose,
  options,
  department,
}: {
  open: boolean;
  onClose: () => void;
  options: OrgOptions;
  department?: DepartmentDto | null;
}) {
  const isEdit = Boolean(department);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [state, action, pending] = useActionState(
    isEdit ? updateDepartmentAction : createDepartmentAction,
    IDLE,
  );
  const [color, setColor] = useState(department?.color ?? "indigo");

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Saved");
      onClose();
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't save", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const remove = async () => {
    if (!department) return;

    const result = await confirm({
      title: `Delete ${department.name}?`,
      description:
        department.memberCount > 0
          ? `This department still has ${department.memberCount} ${
              department.memberCount === 1 ? "person" : "people"
            }. Move them elsewhere first — the delete will be refused otherwise.`
          : `Its ${department.teams.length} team${
              department.teams.length === 1 ? "" : "s"
            } will be removed too. Historical reports keep their attribution.`,
      confirmLabel: "Delete department",
      tone: "danger",
    });
    if (!result.confirmed) return;

    const response = await deleteDepartmentAction(department.id);
    if (response.ok) {
      toast.success(response.message ?? "Deleted");
      onClose();
      router.refresh();
    } else {
      toast.error("Couldn't delete", response.message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? `Edit ${department!.name}` : "New department"}
      description="Departments group people for filtering, analytics and announcements."
      footer={
        <>
          {isEdit ? (
            <Button variant="danger-ghost" onClick={remove} className="sm:mr-auto">
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" variant="primary" loading={pending}>
            <Save className="size-4" />
            {isEdit ? "Save changes" : "Create department"}
          </Button>
        </>
      }
    >
      <form id="department-form" action={action} className="space-y-4" noValidate>
        {isEdit ? <input type="hidden" name="id" value={department!.id} /> : null}
        <input type="hidden" name="color" value={color} />

        <Field label="Name" required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={department?.name} required autoFocus placeholder="Engineering" />
        </Field>

        <Field label="Description" optional error={state.fieldErrors?.description}>
          <Textarea
            name="description"
            rows={2}
            autosize
            defaultValue={department?.description ?? ""}
            placeholder="Builds and runs the product."
          />
        </Field>

        <Field
          label="Colour"
          hint="Used for this department in charts, badges and filters."
          error={state.fieldErrors?.color}
        >
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENT_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={option}
                aria-pressed={color === option}
                className={cn(
                  "size-7 rounded-lg border-2 transition-transform",
                  color === option
                    ? "scale-110 border-fg"
                    : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: `var(--cat-${option})` }}
              />
            ))}
          </div>
        </Field>

        <Field label="Department head" optional error={state.fieldErrors?.headId}>
          <Select
            name="headId"
            defaultValue={department?.head?.id ?? ""}
            placeholder="Nobody assigned"
            options={options.employees.map((person) => ({
              value: person.id,
              label: person.department ? `${person.name} · ${person.department}` : person.name,
            }))}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function TeamDialog({
  open,
  onClose,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  departments: DepartmentDto[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(createTeamAction, IDLE);

  useEffect(() => {
    if (state.ok === true) {
      toast.success(state.message ?? "Team created");
      onClose();
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error("Couldn't create the team", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="New team"
      description="Teams sit inside a department and give a finer grain for filtering."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="team-form" variant="primary" loading={pending}>
            <Plus className="size-4" />
            Create team
          </Button>
        </>
      }
    >
      <form id="team-form" action={action} className="space-y-4" noValidate>
        <Field label="Department" required error={state.fieldErrors?.departmentId}>
          <Select
            name="departmentId"
            required
            placeholder="Choose a department"
            defaultValue=""
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          />
        </Field>

        <Field label="Team name" required error={state.fieldErrors?.name}>
          <Input name="name" required autoFocus placeholder="Platform" />
        </Field>
      </form>
    </Dialog>
  );
}
