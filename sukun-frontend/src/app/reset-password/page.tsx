import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "كلمة مرور جديدة — سكن",
  description: "أعد تعيين كلمة مرور حسابك في منصة سُكن.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthScreen initialScreen="reset" />
    </Suspense>
  );
}
