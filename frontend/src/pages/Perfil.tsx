import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserCog, KeyRound } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';

export default function Perfil() {
  const { user, updateProfile } = useAuth();
  const [isSavingData, setIsSavingData] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    nombre_usuario: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });

  const isPasswordValid = (pwd: string) => {
    return (
      pwd.length >= 8 &&
      /[A-Z]/.test(pwd) &&
      /[a-z]/.test(pwd) &&
      /[0-9]/.test(pwd) &&
      /[^A-Za-z0-9]/.test(pwd)
    );
  };

  useEffect(() => {
    if (user) {
      setFormData({
        nombre: user.nombre || '',
        apellido: user.apellido || '',
        nombre_usuario: user.nombre_usuario || '',
      });
    }
  }, [user]);

  const handleSaveData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.apellido || !formData.nombre_usuario) {
      toast.error('Por favor complete todos los campos');
      return;
    }

    setIsSavingData(true);
    try {
      const response = await apiFetch('/empleados/perfil', {
        method: 'PUT',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        updateProfile({
          nombre: formData.nombre,
          apellido: formData.apellido,
          nombre_usuario: formData.nombre_usuario,
        });
        toast.success(data.mensaje || 'Perfil actualizado exitosamente');
      } else {
        const err = await response.json();
        toast.error(err.error || 'Error al actualizar el perfil');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión');
    } finally {
      setIsSavingData(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordData.currentPassword || !passwordData.password || !passwordData.confirmPassword) {
      toast.error('Por favor complete todos los campos');
      return;
    }
    if (passwordData.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (!/[A-Z]/.test(passwordData.password)) {
      toast.error('La contraseña debe incluir al menos una letra mayúscula');
      return;
    }
    if (!/[a-z]/.test(passwordData.password)) {
      toast.error('La contraseña debe incluir al menos una letra minúscula');
      return;
    }
    if (!/[0-9]/.test(passwordData.password)) {
      toast.error('La contraseña debe incluir al menos un número');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(passwordData.password)) {
      toast.error('La contraseña debe incluir al menos un carácter especial');
      return;
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await apiFetch('/empleados/perfil/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.password,
        }),
      });

      if (response.ok) {
        toast.success('Contraseña actualizada correctamente');
        setPasswordData({ currentPassword: '', password: '', confirmPassword: '' });
      } else {
        const err = await response.json();
        toast.error(err.error || 'Error al actualizar la contraseña');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-muted-foreground">
          Administre su información personal y credenciales de acceso
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Datos Personales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Datos Personales
            </CardTitle>
            <CardDescription>Actualice su información básica de empleado</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveData} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombre_usuario">Nombre de Usuario (Login)</Label>
                <Input
                  id="nombre_usuario"
                  value={formData.nombre_usuario}
                  onChange={(e) => setFormData({ ...formData, nombre_usuario: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">
                  El correo electrónico no puede modificarse ya que es su identificador único en el
                  sistema.
                </p>
              </div>
              <Button type="submit" className="w-full bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20" disabled={isSavingData}>
                {isSavingData ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Cambiar Contraseña */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Seguridad
            </CardTitle>
            <CardDescription>Modifique su contraseña de acceso al sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {!isChangingPassword ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsChangingPassword(true)}
              >
                Cambiar Contraseña
              </Button>
            ) : (
              <form onSubmit={handleSavePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Contraseña Actual</Label>
                  <PasswordInput
                    id="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPassword: e.target.value })
                    }
                    placeholder="Escriba su contraseña actual"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva Contraseña</Label>
                  <PasswordInput
                    id="password"
                    value={passwordData.password}
                    onChange={(e) => setPasswordData({ ...passwordData, password: e.target.value })}
                    placeholder="Escriba su nueva contraseña"
                  />
                  <PasswordRequirements password={passwordData.password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                  <PasswordInput
                    id="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    placeholder="Repita su nueva contraseña"
                  />
                  {passwordData.confirmPassword && (
                    <p
                      className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${passwordData.password === passwordData.confirmPassword ? 'text-green-500' : 'text-destructive'}`}
                    >
                      {passwordData.password === passwordData.confirmPassword
                        ? '✓ Las contraseñas coinciden'
                        : '✗ Las contraseñas no coinciden'}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordData({ currentPassword: '', password: '', confirmPassword: '' });
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="w-full bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20"
                    disabled={
                      isSavingPassword ||
                      !passwordData.password ||
                      passwordData.password !== passwordData.confirmPassword ||
                      !isPasswordValid(passwordData.password)
                    }
                  >
                    {isSavingPassword ? 'Actualizando...' : 'Actualizar'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
