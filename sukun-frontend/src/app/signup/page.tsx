import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "إنشاء حساب — سكن",
  description: "أنشئ حسابك للانضمام إلى منصة سُكن.",
};

export default function SignupPage() {
  return (
    <Suspense>
      <AuthScreen initialScreen="welcome" />
    </Suspense>
  );
}
