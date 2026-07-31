"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Save, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Fieldset } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, optionsFrom } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createEmployeeAction, updateEmployeeAction } from "@/server/actions/employees";
import { IDLE } from "@/server/actions/form-state";
import {
  ROLES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  USER_STATUSES,
  USER_STATUS_LABEL,
  type Role,
} from "@/lib/constants/enums";
import { toDateInput, todayKey } from "@/lib/utils/date";
import type { EmployeeDto, OrgOptions } from "@/types/org";

/**
 * Create / edit an employee.
 *
 * One form for both, because the field set is identical — a separate "edit" form
 * is how the two drift apart. The mode only changes which action runs, whether an
 * `id` is posted, and the status field (a new hire is always INVITED until they
 * set a password, so the control is hidden on create).
 */
export function EmployeeFormDialog({
  open,
  onClose,
  employee,
  options,
  suggestedCode,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent = create mode. */
  employee?: EmployeeDto | null;
  options: OrgOptions;
  suggestedCode: string;
}) {
  const isEdit = Boolean(employee);
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(
    isEdit ? updateEmployeeAction : createEmployeeAction,
    IDLE,
  );

  const [departmentId, setDepartmentId] = useState(employee?.department?.id ?? "");
  const [role, setRole] = useState<Role>(employee?.role ?? "EMPLOYEE");

  useEffect(() => {
    if (state.ok === true) {
      toast.success(isEdit ? "Employee updated" : "Employee added", state.message);
      onClose();
      router.refresh();
    } else if (state.ok === false && state.message && !state.fieldErrors) {
      toast.error(isEdit ? "Couldn't update" : "Couldn't add employee", state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Teams belong to departments, so the team list narrows as soon as one is chosen.
  const availableTeams = departmentId
    ? options.teams.filter((team) => team.departmentId === departmentId)
    : options.teams;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      dismissible={!pending}
      title={isEdit ? `Edit ${employee!.name}` : "Add an employee"}
      description={
        isEdit
          ? "Changes to role or email sign the person out of all devices."
          : "They'll receive an email invitation to choose their own password — no temporary password is created."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" variant="primary" loading={pending}>
            {isEdit ? <Save className="size-4" /> : <UserPlus className="size-4" />}
            {isEdit ? "Save changes" : "Add & send invitation"}
          </Button>
        </>
      }
    >
      <form id="employee-form" action={action} className="space-y-5" noValidate>
        {isEdit ? <input type="hidden" name="id" value={employee!.id} /> : null}
        {!isEdit ? <input type="hidden" name="status" value="INVITED" /> : null}

        {state.ok === false && state.message && !state.fieldErrors ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5"
          >
            <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-[12.5px] leading-[18px] text-danger-text">{state.message}</p>
          </div>
        ) : null}

        <Fieldset legend="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={state.fieldErrors?.name}>
              <Input name="name" defaultValue={employee?.name} required autoFocus placeholder="Aisha Khan" />
            </Field>

            <Field label="Work email" required error={state.fieldErrors?.email}>
              <Input
                name="email"
                type="email"
                defaultValue={employee?.email}
                required
                placeholder="aisha@company.com"
              />
            </Field>

            <Field
              label="Employee ID"
              required
              error={state.fieldErrors?.employeeCode}
              hint="Letters, numbers and dashes."
            >
              <Input
                name="employeeCode"
                defaultValue={employee?.employeeCode ?? suggestedCode}
                required
                className="font-mono"
              />
            </Field>

            <Field label="Designation" optional error={state.fieldErrors?.designation}>
              <Input
                name="designation"
                defaultValue={employee?.designation ?? ""}
                placeholder="Senior Engineer"
              />
            </Field>

            <Field label="Phone" optional error={state.fieldErrors?.phone}>
              <Input
                name="phone"
                type="tel"
                defaultValue={employee?.phone ?? ""}
                placeholder="+91 98765 43210"
              />
            </Field>

            <Field label="Date of birth" optional error={state.fieldErrors?.dateOfBirth}>
              <Input name="dateOfBirth" type="date" />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Placement">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" optional error={state.fieldErrors?.departmentId}>
              <Select
                name="departmentId"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                placeholder="No department"
                options={options.departments.map((department) => ({
                  value: department.id,
                  label: department.name,
                }))}
              />
            </Field>

            <Field
              label="Team"
              optional
              error={state.fieldErrors?.teamId}
              hint={departmentId ? undefined : "Choose a department to narrow this list."}
            >
              <Select
                name="teamId"
                defaultValue={employee?.team?.id ?? ""}
                placeholder="No team"
                options={availableTeams.map((team) => ({
                  value: team.id,
                  label: departmentId ? team.name : `${team.name} · ${team.departmentName}`,
                }))}
              />
            </Field>

            <Field label="Office location" optional error={state.fieldErrors?.locationId}>
              <Select
                name="locationId"
                defaultValue={employee?.location?.id ?? ""}
                placeholder="No location"
                options={options.locations.map((location) => ({
                  value: location.id,
                  label: `${location.name} · ${location.city}`,
                }))}
              />
            </Field>

            <Field
              label="Reporting manager"
              optional
              error={state.fieldErrors?.managerId}
              hint="Their manager approves leave and reviews reports."
            >
              <Select
                name="managerId"
                defaultValue={employee?.manager?.id ?? ""}
                placeholder="No manager"
                options={options.employees
                  // Nobody can be their own manager.
                  .filter((person) => person.id !== employee?.id)
                  .map((person) => ({
                    value: person.id,
                    label: person.department ? `${person.name} · ${person.department}` : person.name,
                  }))}
              />
            </Field>

            <Field label="Joining date" required error={state.fieldErrors?.joinedAt}>
              <Input
                name="joinedAt"
                type="date"
                defaultValue={employee ? toDateInput(employee.joinedAt) : todayKey()}
                required
              />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Access">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Role"
              required
              error={state.fieldErrors?.role}
              hint={ROLE_DESCRIPTION[role]}
            >
              <Select
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                options={optionsFrom(ROLES, ROLE_LABEL)}
              />
            </Field>

            {isEdit ? (
              <Field
                label="Account status"
                error={state.fieldErrors?.status}
                hint="Disabling signs the person out immediately but keeps their history."
              >
                <Select
                  name="status"
                  defaultValue={employee?.status}
                  options={optionsFrom(USER_STATUSES, USER_STATUS_LABEL)}
                />
              </Field>
            ) : null}
          </div>
        </Fieldset>
      </form>
    </Dialog>
  );
}
