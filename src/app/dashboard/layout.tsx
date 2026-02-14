import { getOrgSession } from "@/lib/auth";
import { getOrganization } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOrgSession();
  if (!session) {
    redirect("/login");
  }

  const organization = await getOrganization(session.orgId);

  return (
    <SidebarProvider>
      <AppSidebar user={session.user} organization={organization} />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 space-y-6 p-6">{children}</div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
