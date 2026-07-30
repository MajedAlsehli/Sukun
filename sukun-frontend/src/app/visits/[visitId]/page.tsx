import { VisitExperienceScreen } from "@/components/homeowner/VisitExperienceScreen";

export default async function VisitExperiencePage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  return <VisitExperienceScreen visitId={visitId} />;
}
