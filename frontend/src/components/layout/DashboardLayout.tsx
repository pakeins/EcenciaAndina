import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar, MobileSidebar } from './Sidebar';

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex h-14 items-center gap-4 border-b bg-background px-4">
          <MobileSidebar />
          <div className="font-bold text-cafe truncate">ECencia Andina</div>
        </header>

        <main className="flex-1 overflow-auto bg-background">
          <div className="min-w-0 p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
