import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/constants/brand";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <Link
        href="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5" />
        Back to sign in
      </Link>

      <div className="mb-7">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg">
          Reset your password
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-fg-muted">
          Enter the email address you use for {BRAND.name} and we&apos;ll send you a link to choose a new
          password.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
