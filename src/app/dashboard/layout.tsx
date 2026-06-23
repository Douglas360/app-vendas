export const dynamic = "force-dynamic";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Sino de notificações — fixo no topo direito */}
        <div className="fixed right-4 top-4 z-50">
          <NotificationBell />
        </div>
        <div className="container mx-auto px-4 py-6 lg:px-8 lg:py-8 pt-20 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
