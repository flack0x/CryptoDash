import DashboardShell from "@/components/DashboardShell";
import { fetchDashboardData } from "@/lib/queries";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export default async function Home() {
  const data = await fetchDashboardData();
  return <DashboardShell initial={data} />;
}
