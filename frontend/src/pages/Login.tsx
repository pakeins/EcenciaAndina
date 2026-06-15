import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { API_BASE_URL } from '@/lib/api';

const defaultDestination = (role?: string) => role === 'administrador' ? '/dashboard' : '/pedidos';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingForgot, setIsSendingForgot] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [recoveryUserName, setRecoveryUserName] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const requestedDestination = location.state?.from?.pathname;
  const safeDestination = requestedDestination && requestedDestination !== '/'
    ? requestedDestination
    : defaultDestination(user?.rol);

  useEffect(() => {
    if (user && !window.location.hash.includes('type=recovery')) {
      navigate(safeDestination, { replace: true });
    }
  }, [navigate, safeDestination, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('type') !== 'recovery') return;

    const token = params.get('access_token');
    if (!token) {
      toast.error('El enlace de recuperacion no es valido.');
      return;
    }

    setRecoveryToken(token);
    fetch(`${API_BASE_URL}/empleados/perfil`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((profile) => {
        if (profile?.nombre_usuario || profile?.nombre) {
          setRecoveryUserName(profile.nombre_usuario || profile.nombre);
        }
      })
      .catch(() => undefined);
  }, []);

  const isPasswordValid = (value: string) => (
    value.length >= 8
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
  );

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast.error('Por favor complete todos los campos.');
      return;
    }

    const result = await login(email, password);
    if (!result.success) {
      toast.error(result.message || 'Credenciales invalidas.');
      return;
    }

    const destination = requestedDestination && requestedDestination !== '/'
      ? requestedDestination
      : defaultDestination(result.rol);
    toast.success('Bienvenido al sistema.');
    navigate(destination, { replace: true });
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!forgotEmail) {
      toast.error('Ingrese su correo.');
      return;
    }

    setIsSendingForgot(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: forgotEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'No se pudo procesar la solicitud.');
        return;
      }

      toast.success(data.mensaje);
      setForgotEmail('');
      setIsForgotPassword(false);
    } catch {
      toast.error('Error de conexion con el servidor.');
    } finally {
      setIsSendingForgot(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isPasswordValid(newPassword)) {
      toast.error('La nueva contrasena no cumple los requisitos de seguridad.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contrasenas no coinciden.');
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/empleados/perfil/recovery-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${recoveryToken}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'No se pudo restablecer la contrasena.');
        return;
      }

      toast.success('Contrasena actualizada. Ya puede iniciar sesion.');
      setRecoveryToken(null);
      setNewPassword('');
      setConfirmPassword('');
      window.history.replaceState(null, '', '/login');
    } catch {
      toast.error('Error de conexion con el servidor.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight text-primary">
              {recoveryToken ? 'Restablecer contrasena' : 'ECencia Andina'}
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              {recoveryToken
                ? recoveryUserName
                  ? `Hola ${recoveryUserName}, ingrese su nueva contrasena.`
                  : 'Ingrese su nueva contrasena.'
                : 'Sistema de gestion de almuerzos'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {recoveryToken ? (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva contrasena</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <PasswordRequirements password={newPassword} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
                {confirmPassword && (
                  <p className={newPassword === confirmPassword ? 'text-xs text-green-600' : 'text-xs text-destructive'}>
                    {newPassword === confirmPassword ? 'Las contrasenas coinciden.' : 'Las contrasenas no coinciden.'}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isResetting || !isPasswordValid(newPassword) || newPassword !== confirmPassword}
              >
                {isResetting ? 'Actualizando...' : 'Guardar nueva contrasena'}
              </Button>
            </form>
          ) : isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgotEmail">Correo electronico</Label>
                <Input
                  id="forgotEmail"
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Si el correo esta registrado, recibira un enlace de recuperacion.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setIsForgotPassword(false)}>
                  Volver
                </Button>
                <Button type="submit" className="w-full" disabled={isSendingForgot}>
                  {isSendingForgot ? 'Enviando...' : 'Enviar enlace'}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Usuario o correo</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contrasena</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" size="lg">
                Iniciar sesion
              </Button>
              <div className="text-center">
                <Button type="button" variant="link" className="text-xs" onClick={() => setIsForgotPassword(true)}>
                  Olvide mi contrasena
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
