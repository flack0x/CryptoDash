import DashboardShell from "@/components/DashboardShell";
import { fetchDashboardData } from "@/lib/queries";

export const dynamic = "force-dynamic"; // Always fetch fresh data server-side on every page load

export default async function Home() {
  const data = await fetchDashboardData();
  return <DashboardShell initial={data} />;
}
