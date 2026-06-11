import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ClipboardList,
  FileBarChart,
  Building2,
  Users,
  LogOut,
  UtensilsCrossed,
  UserCog,
  ChefHat,
  KeyRound,
  Package,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: ('administrador' | 'caja')[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Pedidos',
    path: '/pedidos',
    icon: <ClipboardList className="h-5 w-5" />,
    roles: ['caja', 'administrador'],
  },
  {
    label: 'Menú Diario',
    path: '/menu',
    icon: <ChefHat className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Reportes',
    path: '/reportes',
    icon: <FileBarChart className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Trazabilidad',
    path: '/trazabilidad-telegram',
    icon: <Activity className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Convenios',
    path: '/convenios',
    icon: <Building2 className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Clientes',
    path: '/clientes',
    icon: <Users className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Empleados',
    path: '/usuarios',
    icon: <UserCog className="h-5 w-5" />,
    roles: ['administrador'],
  },
  {
    label: 'Productos',
    path: '/productos',
    icon: <Package className="h-5 w-5" />,
    roles: ['administrador'],
  },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const filteredNavItems = navItems.filter((item) => user && item.roles.includes(user.rol));

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-5 bg-accent/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
          <UtensilsCrossed className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-cafe tracking-tight">ECencia Andina</h1>
          <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">Tradición Natural</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-cafe text-white shadow-md shadow-cafe/20 scale-[1.02]'
                  : 'text-muted-foreground hover:bg-cafe hover:text-white hover:shadow-sm'
              )}
            >
              <div className={cn(
                "transition-colors duration-200",
                isActive ? "text-white" : "group-hover:text-white",
                !isActive && (
                  item.label === 'Dashboard' ? 'text-primary' :
                  item.label === 'Pedidos' ? 'text-terracota' :
                  item.label === 'Menú Diario' ? 'text-oro' :
                  item.label === 'Reportes' ? 'text-secondary' :
                  item.label === 'Trazabilidad' ? 'text-terracota' :
                  item.label === 'Convenios' ? 'text-primary' :
                  item.label === 'Clientes' ? 'text-terracota' :
                  item.label === 'Empleados' ? 'text-oro' :
                  item.label === 'Productos' ? 'text-secondary' : ''
                )
              )}>
                {item.icon}
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="border-t border-border p-4">
        <div className="mb-3 rounded-lg bg-accent px-3 py-2">
          <p className="text-sm font-medium text-foreground">{user?.nombre}</p>
          <p className="text-xs capitalize text-muted-foreground">{user?.rol}</p>
        </div>

        <Link to="/perfil">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <UserCog className="h-4 w-4" />
            Mi Perfil
          </Button>
        </Link>

        <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </Button>
      </div>
    </aside>
  );
}
