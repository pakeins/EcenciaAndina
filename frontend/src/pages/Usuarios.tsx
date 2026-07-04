import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, UserCog, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

interface Empleado {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  nombre_usuario: string;
  esta_activo: boolean;
  created_at: string;
  roles?: { nombre_rol: string };
  id_rol?: string | number;
}

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<Empleado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Empleado | null>(null);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState<Empleado | null>(null);

  const [editFormData, setEditFormData] = useState({
    nombre: '',
    apellido: '',
    nombre_usuario: '',
    id_rol: '',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ password: '', confirmPassword: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [createFormData, setCreateFormData] = useState({
    nombre: '',
    apellido: '',
    correo: '',
    nombre_usuario: '',
    password: '',
    id_rol: '2', // Operativo por defecto
  });
  const [isSavingCreate, setIsSavingCreate] = useState(false);

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
    fetchEmpleados();
  }, []);

  const fetchEmpleados = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/empleados');

      const data = await response.json();

      if (response.ok) {
        setUsers(data);
      } else {
        console.error('Backend error:', data);
        setError(data.error || 'Error al obtener empleados del servidor');
        toast.error(data.error || 'Error al cargar empleados');
      }
    } catch (error) {
      console.error('Error fetching empleados:', error);
      setError('Error de conexión con el servidor');
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(createFormData.password)) {
      toast.error('La contraseña no cumple con los requisitos');
      return;
    }

    setIsSavingCreate(true);
    try {
      const response = await apiFetch('/empleados', {
        method: 'POST',
        body: JSON.stringify(createFormData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Empleado creado correctamente');
        setUsers([data, ...users]);
        setIsCreateOpen(false);
        setCreateFormData({
          nombre: '',
          apellido: '',
          correo: '',
          nombre_usuario: '',
          password: '',
          id_rol: '2',
        });
      } else {
        toast.error(data.error || 'Error al crear el empleado');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSavingCreate(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSavingEdit(true);
    try {
      const response = await apiFetch(`/empleados/${selectedUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editFormData),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Empleado actualizado correctamente');
        setUsers(users.map((u) => (u.id === selectedUser.id ? data : u)));
        setIsEditOpen(false);
      } else {
        toast.error(data.error || 'Error al actualizar el empleado');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Error de conexión al guardar');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleResetPassword = async (id: string, nombre: string) => {
    try {
      const response = await apiFetch(`/empleados/${id}/reset-password`, {
        method: 'POST',
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.mensaje || `Enlace enviado a ${nombre}`);
      } else {
        toast.error(data.error || 'Error al enviar enlace de recuperación');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión');
    }
  };

  const handleForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!passwordData.password || !passwordData.confirmPassword) {
      toast.error('Por favor complete ambas contraseñas');
      return;
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (!isPasswordValid(passwordData.password)) {
      toast.error('La contraseña no cumple con los requisitos');
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await apiFetch(
        `/empleados/${selectedUser.id}/password`,
        {
          method: 'PUT',
          body: JSON.stringify({ password: passwordData.password }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        toast.success('Contraseña actualizada correctamente');
        setIsChangingPassword(false);
        setPasswordData({ password: '', confirmPassword: '' });
      } else {
        toast.error(data.error || 'Error al actualizar la contraseña');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleToggleClick = (user: Empleado) => {
    if (user.esta_activo) {
      // Pedir confirmación para desactivar
      setUserToToggle(user);
      setIsAlertOpen(true);
    } else {
      // Activar directamente
      confirmToggle(user.id, true);
    }
  };

  const confirmToggle = async (id: string, newState: boolean) => {
    try {
      const response = await apiFetch(`/empleados/${id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ esta_activo: newState }),
      });

      if (response.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, esta_activo: newState } : u)));

        const nombreEmpleado = users.find((u) => u.id === id)?.nombre || 'El empleado';

        if (newState) {
          toast.success(
            `Acceso concedido: ${nombreEmpleado} puede ingresar al sistema nuevamente.`,
          );
        } else {
          toast.success(`Acceso revocado: ${nombreEmpleado} ya no podrá iniciar sesión.`);
        }
      } else {
        toast.error('Error al cambiar el estado del empleado');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error de conexión');
    } finally {
      setIsAlertOpen(false);
      setUserToToggle(null);
    }
  };

  const openEditDialog = (user: Empleado) => {
    setSelectedUser(user);
    setEditFormData({
      nombre: user.nombre,
      apellido: user.apellido,
      nombre_usuario: user.nombre_usuario,
      id_rol: String(user.id_rol || '2'),
    });
    setIsChangingPassword(false);
    setPasswordData({ password: '', confirmPassword: '' });
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Gestión de Empleados
          </h1>
          <p className="text-muted-foreground text-lg">Administre el equipo de trabajo y los roles de acceso</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20 h-11 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Nuevo Empleado
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={createFormData.nombre}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, nombre: e.target.value.replace(/[\d]/g, '') })
                    }
                    required
                    placeholder="Ej. Juan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    value={createFormData.apellido}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, apellido: e.target.value.replace(/[\d]/g, '') })
                    }
                    required
                    placeholder="Ej. Pérez"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="correo">Correo Electrónico</Label>
                <Input
                  id="correo"
                  type="email"
                  value={createFormData.correo}
                  onChange={(e) => setCreateFormData({ ...createFormData, correo: e.target.value })}
                  required
                  placeholder="juan.perez@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usuario">Nombre de Usuario</Label>
                <Input
                  id="usuario"
                  value={createFormData.nombre_usuario}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, nombre_usuario: e.target.value })
                  }
                  required
                  placeholder="jperez"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  value={createFormData.password}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, password: e.target.value })
                  }
                  required
                />
                <PasswordRequirements password={createFormData.password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rol">Rol del Sistema</Label>
                <select
                  id="rol"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={createFormData.id_rol}
                  onChange={(e) => setCreateFormData({ ...createFormData, id_rol: e.target.value })}
                  required
                >
                  <option value="2">Operativo</option>
                  <option value="1">Administrativo</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20"
                  disabled={isSavingCreate || !isPasswordValid(createFormData.password)}
                >
                  {isSavingCreate ? 'Creando...' : 'Crear Empleado'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empleados ECencia Andina</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                  <TableHead className="text-cafe font-bold">Nombre Completo</TableHead>
                  <TableHead className="text-cafe font-bold">Usuario</TableHead>
                  <TableHead className="text-cafe font-bold">Correo</TableHead>
                  <TableHead className="text-cafe font-bold">Rol Asignado</TableHead>
                  <TableHead className="text-cafe font-bold">Estado</TableHead>
                  <TableHead className="text-right text-cafe font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                      <p className="animate-pulse text-muted-foreground">Cargando datos...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-destructive">
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-semibold">Ocurrió un error</p>
                      <p className="text-sm">{error}</p>
                      <Button variant="outline" size="sm" onClick={fetchEmpleados} className="mt-2">
                        Reintentar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No se encontraron empleados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.nombre} {user.apellido}
                    </TableCell>
                    <TableCell>{user.nombre_usuario}</TableCell>
                    <TableCell>{user.correo}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.roles?.nombre_rol || 'Sin rol'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          disabled={currentUser?.id === user.id}
                          checked={user.esta_activo}
                          onCheckedChange={() => handleToggleClick(user)}
                        />
                        <Badge variant={user.esta_activo ? 'default' : 'secondary'}>
                          {user.esta_activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          title="Editar empleado"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Empleado
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6 py-2">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nombre">Nombre</Label>
                  <Input
                    id="edit-nombre"
                    value={editFormData.nombre}
                    onChange={(e) => setEditFormData({ ...editFormData, nombre: e.target.value.replace(/[\d]/g, '') })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-apellido">Apellido</Label>
                  <Input
                    id="edit-apellido"
                    value={editFormData.apellido}
                    onChange={(e) => setEditFormData({ ...editFormData, apellido: e.target.value.replace(/[\d]/g, '') })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-usuario">Nombre de Usuario</Label>
                  <Input
                    id="edit-usuario"
                    value={editFormData.nombre_usuario}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, nombre_usuario: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Correo Electrónico (Solo lectura)</Label>
                  <Input value={selectedUser.correo} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rol">Rol del Sistema</Label>
                  <select
                    id="edit-rol"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    value={editFormData.id_rol}
                    onChange={(e) => setEditFormData({ ...editFormData, id_rol: e.target.value })}
                    disabled={currentUser?.id === selectedUser.id}
                    required
                  >
                    <option value="2">Operativo</option>
                    <option value="1">Administrativo</option>
                  </select>
                  {currentUser?.id === selectedUser.id && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No puedes cambiar tu propio rol.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSavingEdit} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">
                    {isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                </div>
              </form>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold">Seguridad y Contraseña</h3>
                <div className="space-y-3 rounded-lg border bg-accent/50 p-4">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Restablecer contraseña por correo</p>
                      <p className="text-xs text-muted-foreground">
                        Enviar un correo con el enlace seguro
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleResetPassword(selectedUser.id, selectedUser.nombre)}
                  >
                    Enviar enlace por correo
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border bg-accent/50 p-4">
                  <div className="flex items-center gap-3">
                    <UserCog className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Restablecer contraseña en el sistema</p>
                      <p className="text-xs text-muted-foreground">
                        Cambiar ahora la contraseña del empleado
                      </p>
                    </div>
                  </div>
                  {!isChangingPassword ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsChangingPassword(true)}
                    >
                      Cambiar contraseña ahora
                    </Button>
                  ) : (
                    <div className="space-y-4 border-t border-border/50 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Nueva Contraseña</Label>
                        <PasswordInput
                          id="new-password"
                          value={passwordData.password}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, password: e.target.value })
                          }
                          placeholder="Escriba la nueva contraseña"
                        />
                        <PasswordRequirements password={passwordData.password} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-new-password">Confirmar Contraseña</Label>
                        <PasswordInput
                          id="confirm-new-password"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          placeholder="Repita la nueva contraseña"
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
                      <div className="flex gap-2 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => {
                            setIsChangingPassword(false);
                            setPasswordData({ password: '', confirmPassword: '' });
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={
                            isSavingPassword ||
                            !passwordData.password ||
                            passwordData.password !== passwordData.confirmPassword ||
                            !isPasswordValid(passwordData.password)
                          }
                          onClick={handleForcePasswordChange}
                        >
                          {isSavingPassword ? 'Actualizando...' : 'Actualizar'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Alert Dialog */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro que desea desactivar a{' '}
              <strong>
                {userToToggle?.nombre} {userToToggle?.apellido}
              </strong>
              ?
              <br />
              <br />
              Este empleado ya no podrá iniciar sesión en el sistema hasta que vuelva a ser
              activado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToToggle(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToToggle && confirmToggle(userToToggle.id, false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
