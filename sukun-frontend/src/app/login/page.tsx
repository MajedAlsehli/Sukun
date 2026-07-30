import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = {
  title: "تسجيل الدخول — سكن",
  description: "سجّل الدخول إلى حسابك في منصة سُكن.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <AuthScreen initialScreen="login" />
    </Suspense>
  );
}
