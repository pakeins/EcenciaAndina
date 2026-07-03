import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Client } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, User, Phone, Search, IdCard, Users, Building2, Trash2, Filter, Activity, UserCheck, Wallet, Mail, Send, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WalletDialog } from '@/components/clients/WalletDialog';
import { RechargeDialog } from '@/components/clients/RechargeDialog';
import { useClientsAndConvenios } from '@/hooks/useClientsAndConvenios';
import { isConvenioVigente, isValidPersonName, normalizePersonName, sanitizePersonNameInput } from '@/lib/businessRules';
import { FIELD_LIMITS, isValidEmail, normalizeEmail, onlyDigits, normalizePhone } from '@/lib/validation';
import { emailBadgeVariant, emailStatusLabel } from './convenios.helpers';

const FRECUENTE_CLIENT_TYPE = 1;
const CONVENIO_CLIENT_TYPE = 2;

const matchesClientFilters = (c: Client, searchTerm: string, filterType: string, filterStatus: string) => {
  const term = searchTerm.toLowerCase();
  const matchesSearch =
    `${c.nombre} ${c.apellido}`.toLowerCase().includes(term) ||
    c.cedula.includes(searchTerm) ||
    c.email?.toLowerCase().includes(term) ||
    c.telefono?.includes(searchTerm);

  const matchesType = filterType === 'all' || String(c.id_tipo_cliente) === filterType;
  const matchesStatus = filterStatus === 'all' ||
    (filterStatus === 'active' && c.activo) ||
    (filterStatus === 'inactive' && !c.activo);

  return Boolean(matchesSearch) && matchesType && matchesStatus;
};

export default function Clientes() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [walletOpen, setWalletOpen] = useState(false);
  const [walletClient, setWalletClient] = useState<Client | null>(null);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resendingClientId, setResendingClientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const { convenios } = useClientsAndConvenios();

  // Confirmación para toggle activo/inactivo
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [clientToToggle, setClientToToggle] = useState<Client | null>(null);

  const [formData, setFormData] = useState({
    cedula: '',
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    id_tipo_cliente: FRECUENTE_CLIENT_TYPE,
    id_convenio: '',
  });

  const { data: clientTypes = [] } = useQuery<{ id_tipo_cliente: number; nombre_tipo: string }[]>({
    queryKey: ['tipos-cliente'],
    queryFn: async () => {
      const response = await apiFetch('/clientes/tipos');
      if (!response.ok) throw new Error('Error fetching tipos');
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hora
  });

  const { data: clients = [], isLoading, error: queryError } = useQuery<Client[]>({
    queryKey: ['clientes'],
    queryFn: async () => {
      const response = await apiFetch('/clientes');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al obtener clientes');
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const error = queryError?.message || null;

  const fetchClientes = () => {
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
  };

  // --- FILTRO DE BÚSQUEDA ---
  const filteredClients = clients.filter((c) => matchesClientFilters(c, searchTerm, filterType, filterStatus));

  // --- FORMULARIO: ABRIR NUEVO ---
  const handleOpenNew = () => {
    setEditingClient(null);
    setFormData({
      cedula: '',
      nombre: '',
      apellido: '',
      email: '',
      telefono: '',
      id_tipo_cliente: FRECUENTE_CLIENT_TYPE,
      id_convenio: '',
    });
    setDialogOpen(true);
  };

  // --- FORMULARIO: ABRIR EDICIÓN ---
  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      cedula: client.cedula,
      nombre: client.nombre,
      apellido: client.apellido,
      email: client.email || '',
      telefono: client.telefono,
      id_tipo_cliente: client.id_tipo_cliente || 1,
      id_convenio: client.convenio?.id || '',
    });
    setDialogOpen(true);
  };

  const handleOpenWallet = (client: Client) => {
    setWalletClient(client);
    setWalletOpen(true);
  };

  // --- GUARDAR (CREAR O ACTUALIZAR) ---
  const handleSave = async () => {
    if (!formData.cedula || !formData.nombre || !formData.apellido || (!editingClient && !formData.email)) {
      toast.error('Cédula, nombre, apellido y correo son requeridos');
      return;
    }

    if (formData.cedula.length !== 10) {
      toast.error('La cédula debe tener exactamente 10 dígitos');
      return;
    }

    if (!isValidPersonName(formData.nombre) || !isValidPersonName(formData.apellido)) {
      toast.error('Nombre y apellido solo deben contener letras y separadores validos');
      return;
    }

    if (formData.email && !isValidEmail(formData.email)) {
      toast.error('El correo no es valido');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        cedula: onlyDigits(formData.cedula),
        nombre: normalizePersonName(formData.nombre),
        apellido: normalizePersonName(formData.apellido),
        email: normalizeEmail(formData.email),
        telefono: normalizePhone(formData.telefono),
      };

      if (editingClient) {
        // ACTUALIZAR
        const response = await apiFetch(`/clientes/${editingClient.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok) {
          fetchClientes();
          toast.success('Cliente actualizado correctamente');
          setDialogOpen(false);
        } else {
          toast.error(data.error || 'Error al actualizar el cliente');
        }
      } else {
        // CREAR
        const response = await apiFetch('/clientes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok) {
          fetchClientes();
          const emailStatus = data.invitationResult?.emailStatus;
          if (emailStatus && emailStatus !== 'sent') {
            toast.warning(
              'Cliente registrado, pero el correo de invitación no se pudo enviar (límite del proveedor de correo). Usa "Reenviar invitación" más tarde.',
            );
          } else {
            toast.success('Cliente registrado correctamente');
          }
          setDialogOpen(false);
        } else {
          toast.error(data.error || 'Error al crear el cliente');
        }
      }
    } catch (err) {
      console.error('Error guardando cliente:', err);
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendInvitation = async (client: Client) => {
    if (!client.email) {
      toast.error('El cliente no tiene correo registrado');
      return;
    }

    setResendingClientId(client.id);
    try {
      const response = await apiFetch(`/clientes/${client.id}/telegram-invitacion`, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        fetchClientes();
        const statusText = emailStatusLabel(data.emailStatus);
        if (data.emailStatus === 'sent') {
          toast.success(`Invitación enviada a ${data.emailTo || client.email}`);
        } else {
          toast.warning(`Invitación generada, correo: ${statusText}`);
        }
      } else {
        toast.error(data.error || 'No se pudo reenviar la invitacion');
      }
    } catch (err) {
      console.error('Error reenviando invitacion:', err);
      toast.error('Error de conexion al reenviar invitacion');
    } finally {
      setResendingClientId(null);
    }
  };

  // --- TOGGLE ACTIVO/INACTIVO ---
  const handleToggleClick = (client: Client) => {
    if (client.activo) {
      setClientToToggle(client);
      setIsAlertOpen(true);
    } else {
      confirmToggle(client.id, true);
    }
  };

  const confirmToggle = async (id: string, newState: boolean) => {
    try {
      const response = await apiFetch(`/clientes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: newState }),
      });

      if (response.ok) {
        const data = await response.json();
        fetchClientes();

        const nombre = clients.find((c) => c.id === id);
        const nombreCompleto = nombre ? `${nombre.nombre} ${nombre.apellido}` : 'El cliente';
        toast.success(
          newState
            ? `${nombreCompleto} ha sido activado.`
            : `${nombreCompleto} ha sido desactivado.`,
        );
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al cambiar el estado');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión');
    } finally {
      setIsAlertOpen(false);
      setClientToToggle(null);
    }
  };

  // --- STATS ---
  const activeCount = clients.filter((c) => c.activo).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Clientes
          </h1>
          <p className="text-muted-foreground text-lg">Administración de clientes y colaboradores de Ecencia Andina</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setRechargeOpen(true)} variant="outline" className="gap-2 border-cafe text-cafe hover:bg-cafe/10 shadow-lg shadow-cafe/5 h-12 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
            <Banknote className="h-5 w-5" />
            Recargar Saldo
          </Button>
          <Button onClick={handleOpenNew} className="gap-2 bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20 h-12 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
            <Plus className="h-5 w-5" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border shadow-sm border-l-4 border-l-primary bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-foreground">{clients.length}</p>
                <p className="text-sm font-bold text-cafe uppercase tracking-wider">Total Registrados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm border-l-4 border-l-secondary bg-secondary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-white shadow-sm">
                <UserCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-foreground">{activeCount}</p>
                <p className="text-sm font-bold text-cafe uppercase tracking-wider">Clientes Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm border-l-4 border-l-terracota bg-terracota/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-terracota text-white shadow-sm">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-black text-foreground">{clients.length - activeCount}</p>
                <p className="text-sm font-bold text-cafe uppercase tracking-wider">Clientes Inactivos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clients Table */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Lista de Clientes</CardTitle>
              <CardDescription>Administre los clientes y su información</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Búsqueda</span>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Nombre, cédula o teléfono..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-muted/30 focus-visible:bg-background transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Tipo de Cliente</span>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px] bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <SelectValue placeholder="Todos" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {clientTypes.map(t => (
                      <SelectItem key={t.id_tipo_cliente} value={String(t.id_tipo_cliente)}>{t.nombre_tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Estado</span>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px] bg-muted/30">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      <SelectValue placeholder="Todos" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mb-1 text-muted-foreground hover:text-foreground h-9"
                onClick={() => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all'); }}
              >
                Limpiar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                  <TableHead className="text-cafe font-bold">Nombre de Cliente</TableHead>
                  <TableHead className="text-cafe font-bold">Tipo de Cliente</TableHead>
                  <TableHead className="text-cafe font-bold">Cédula</TableHead>
                  <TableHead className="text-cafe font-bold">Teléfono</TableHead>
                  <TableHead className="text-cafe font-bold">Estado</TableHead>
                  <TableHead className="text-right text-cafe font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="animate-pulse text-muted-foreground">Cargando clientes...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-destructive">
                      <div className="flex flex-col items-center gap-2">
                        <p className="font-semibold">Ocurrió un error</p>
                        <p className="text-sm">{error}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchClientes}
                          className="mt-2"
                        >
                          Reintentar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {searchTerm
                        ? 'No se encontraron clientes con esa búsqueda'
                        : 'No hay clientes registrados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                            <User className="h-4 w-4 text-foreground" />
                          </div>
                          <span className="font-medium text-foreground">
                            {client.nombre} {client.apellido}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit bg-primary/5">
                            {client.tipo_nombre || 'Frecuente'}
                          </Badge>
                          {client.convenio && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {client.convenio.nombre}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-foreground">
                          <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
                          {client.cedula}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {client.telefono || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.activo ? 'default' : 'secondary'}>
                          {client.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {(!client.convenio && client.id_tipo_cliente === 2) && (
                            <Button variant="ghost" size="icon" onClick={() => handleOpenWallet(client)} title="Monedero Virtual">
                              <Wallet className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          <Switch
                            checked={client.activo}
                            onCheckedChange={() => handleToggleClick(client)}
                          />
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}>
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

      {/* Dialog for Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
            </DialogTitle>
            <DialogDescription>
              {editingClient ? 'Modifique los datos del cliente' : 'Registre un nuevo cliente'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cedula">Cédula *</Label>
              <Input
                id="cedula"
                value={formData.cedula}
                onChange={(e) => setFormData({ ...formData, cedula: e.target.value.replace(/\D/g, '') })}
                placeholder="Ej: 1712345678"
                maxLength={10}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value.replace(/[\d]/g, '') })}
                  placeholder="Nombre del cliente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido *</Label>
                <Input
                  id="apellido"
                  value={formData.apellido}
                  onChange={(e) => setFormData({ ...formData, apellido: e.target.value.replace(/[\d]/g, '') })}
                  placeholder="Apellido del cliente"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ej: 0999999999"
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Cliente</Label>
                <Select
                  value={String(formData.id_tipo_cliente)}
                  onValueChange={(value) =>
                    setFormData({ ...formData, id_tipo_cliente: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientTypes.map((tipo) => (
                      <SelectItem key={tipo.id_tipo_cliente} value={String(tipo.id_tipo_cliente)}>
                        {tipo.nombre_tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* SECCIÓN DE CONVENIO - PARA CLIENTES TIPO CONVENIO (Creación o sin convenio actual) */}
            {formData.id_tipo_cliente === 1 && !editingClient?.convenio && (
              <div className="space-y-2">
                <Label htmlFor="id_convenio">Vincular a Convenio (Opcional)</Label>
                <Select
                  value={String(formData.id_convenio || 'none')}
                  onValueChange={(value) =>
                    setFormData({ ...formData, id_convenio: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un convenio (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin convenio por ahora</SelectItem>
                    {convenios.filter(c => c.activo).map((conv) => (
                      <SelectItem key={conv.id} value={String(conv.id)}>
                        {conv.nombre_empresa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SECCIÓN DE CONVENIO */}
            {editingClient?.convenio && (
              <div className="rounded-lg border border-border p-4 bg-accent/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Vinculado a Convenio</span>
                  </div>
                  <Badge variant="outline" className="bg-primary/10">Activo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground font-semibold">
                    {editingClient.convenio.nombre}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 h-8"
                    onClick={async () => {
                      if (confirm(`¿Quitar a ${editingClient.nombre} del convenio ${editingClient.convenio?.nombre}?`)) {
                        try {
                          const res = await apiFetch(`/clientes/${editingClient.id}/convenio`, {
                            method: 'DELETE'
                          });
                          if (res.ok) {
                            toast.success('Vínculo eliminado');
                            // Actualizar localmente
                            setEditingClient({ ...editingClient, convenio: null });
                            fetchClientes();
                          }
                        } catch (err) {
                          toast.error('Error al desvincular');
                        }
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Quitar del Convenio
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">
              {isSaving
                ? editingClient
                  ? 'Guardando...'
                  : 'Registrando...'
                : editingClient
                  ? 'Guardar Cambios'
                  : 'Registrar Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WalletDialog
        open={walletOpen}
        onOpenChange={setWalletOpen}
        client={walletClient}
      />

      <RechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        clients={clients}
      />

      {/* Confirmación para desactivar */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro que desea desactivar a{' '}
              <strong>
                {clientToToggle?.nombre} {clientToToggle?.apellido}
              </strong>
              ?
              <br />
              <br />
              El cliente quedará inactivo hasta que se reactive manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClientToToggle(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clientToToggle && confirmToggle(clientToToggle.id, false)}
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
