import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="min-w-0 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
