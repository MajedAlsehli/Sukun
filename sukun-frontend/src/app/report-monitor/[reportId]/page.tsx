import { Suspense } from "react";
import { ReportMonitorScreen } from "@/components/shared/ReportMonitorScreen";

export default async function ReportMonitorPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return (
    <Suspense>
      <ReportMonitorScreen reportId={reportId} />
    </Suspense>
  );
}
