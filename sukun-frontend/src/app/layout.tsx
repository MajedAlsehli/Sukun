import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { DemoRoleSwitcher } from "@/components/demo/DemoRoleSwitcher";
import { SessionMenu } from "@/components/auth/SessionMenu";
import { BottomStack } from "@/components/mobile/BottomStack";
import "./globals.css";

// 13_Design_Tokens.md §3 — the real product font, 5 weights.
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "سكن — بثقةٍ تُسكن",
  description:
    "من التسليم إلى ما بعد الضمان، منصة ذكية توحّد عمليات المطورين وترتقي بتجربة الملّاك والمستفيدين في تجربة واحدة متكاملة.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={ibmPlexSansArabic.variable}>
      <body>
        <AuthProvider>
          {children}
          <DemoRoleSwitcher />
          {/* Mutually exclusive with the switcher above: one renders only in
              Demo Mode, the other only in real mode. */}
          <SessionMenu />
          {/* Renders nothing. Measures the fixed bottom layers (nav, a screen's
              CTA bar) and publishes their real heights, so nothing at the
              bottom of the screen is drawn on top of anything else. */}
          <BottomStack />
        </AuthProvider>
      </body>
    </html>
  );
}
