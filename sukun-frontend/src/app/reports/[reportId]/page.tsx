import { MyReportsScreen } from "@/components/homeowner/MyReportsScreen";

export default async function MyReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <MyReportsScreen reportId={reportId} />;
}
