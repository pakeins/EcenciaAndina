import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pedidos from './pages/Pedidos';
import HistorialPedidos from './pages/HistorialPedidos';
import Reportes from './pages/Reportes';
import Convenios from './pages/Convenios';
import Clientes from './pages/Clientes';
import Usuarios from './pages/Usuarios';
import Menu from './pages/Menu';
import Productos from './pages/Productos';
import NotFound from './pages/NotFound';
import Perfil from './pages/Perfil';
import Privacidad from './pages/Privacidad';
import TrazabilidadTelegram from './pages/TrazabilidadTelegram';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to={`/login${window.location.hash}`} replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacidad" element={<Privacidad />} />
            
            {/* Rutas protegidas generales (Cualquier rol) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/pedidos" element={<Pedidos />} />
                <Route path="/historial-pedidos" element={<HistorialPedidos />} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/convenios" element={<Convenios />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/productos" element={<Productos />} />
                <Route path="/menu" element={<Menu />} />
                
                {/* Rutas exclusivas de administrador */}
                <Route element={<ProtectedRoute allowedRoles={['administrador']} />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/reportes" element={<Reportes />} />
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/trazabilidad" element={<TrazabilidadTelegram />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
