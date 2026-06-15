import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirigir a login pero guardando la ubicación actual para volver después
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.rol)) {
    // Si el usuario no tiene el rol permitido, redirigir al dashboard o una página de acceso denegado
    return <Navigate to={user.rol === 'administrador' ? '/dashboard' : '/pedidos'} replace />;
  }

  return <Outlet />;
}
