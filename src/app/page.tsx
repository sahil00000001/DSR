import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Root route is a router, not a page: signed-in users land on their dashboard,
 * everyone else on sign-in. Middleware already handles the unauthenticated case
 * for app routes, but `/` itself is public so it decides here.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
