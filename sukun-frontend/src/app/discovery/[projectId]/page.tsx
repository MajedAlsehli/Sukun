import { ProjectDetailsScreen } from "@/components/homeowner/ProjectDetailsScreen";

export default async function ProjectDetailsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetailsScreen projectId={projectId} />;
}
