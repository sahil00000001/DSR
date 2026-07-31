import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getClaimApprovers } from "@/lib/services/expenses";
import { isStorageConfigured } from "@/lib/storage/supabase-storage";
import { ExpenseForm } from "@/components/expenses/expense-form";

export const metadata: Metadata = {
  title: "File an expense claim",
  description: "Claim money you spent on the company's behalf.",
};

export default async function NewExpensePage() {
  const user = await requireUser();
  const approvers = await getClaimApprovers(user.id);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Expenses", href: "/expenses" }, { label: "New claim" }]}
        title="File an expense claim"
        description="Attach the bill, say what it was for, and you can follow it from submitted through to paid."
      />

      <div className="max-w-3xl">
        <ExpenseForm
          approverNames={approvers.map((approver) => approver.name)}
          storageReady={isStorageConfigured()}
        />
      </div>
    </>
  );
}
