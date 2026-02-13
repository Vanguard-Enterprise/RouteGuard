import { requireSuperAdmin } from "@/lib/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { Toaster } from "@/components/ui/sonner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSuperAdmin();

  return (
    <SidebarProvider>
      <AdminSidebar user={user} />
      <SidebarInset>
        <AdminHeader />
        <div className="flex-1 space-y-6 p-6">{children}</div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
