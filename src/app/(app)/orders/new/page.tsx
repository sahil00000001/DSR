import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listEmployees } from "@/lib/services/people";
import { OrderForm } from "@/components/orders/order-form";

export const metadata: Metadata = {
  title: "New order",
  description: "Create a customer order and lay out its stages.",
};

export default async function NewOrderPage() {
  const user = await requireUser();
  if (!can.manageOrders(user)) redirect("/forbidden");

  const employees = await listEmployees({ status: ["ACTIVE"] }, user);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "New order" }]}
        title="New order"
        description="Lay out the stages in sequence with a number of days each. The form tells you whether the plan fits before you create it."
      />

      <div className="max-w-4xl">
        <OrderForm
          people={employees.map((employee) => ({
            id: employee.id,
            name: employee.name,
            designation: employee.designation,
          }))}
        />
      </div>
    </>
  );
}
