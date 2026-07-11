import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Client, Convenio, TelegramOnboarding, TelegramStatus } from '@/types';
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
import { Plus, Pencil, User, Phone, Search, IdCard, Users, Building2, Activity, UserCheck, Wallet, Send, ShieldCheck, Mail, Trash2 } from 'lucide-react';
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
import { Banknote } from 'lucide-react';
import { FIELD_LIMITS, isValidEcDocument, isValidEmail, isValidPhone, normalizePhone, onlyDigits } from '@/lib/validation';
import { CLIENT_TYPE } from '@/constants/domain';
import { useAuth } from '@/contexts/AuthContext';
import { TelegramOnboardingDialog } from '@/components/clients/TelegramOnboardingDialog';
import { TelegramPrivacyRequestsDialog } from '@/components/clients/TelegramPrivacyRequestsDialog';
import { TelegramActionDialog } from '@/components/clients/TelegramActionDialog';
import { ClientFormDialog } from '@/components/clientes/ClientFormDialog';
import { ClientDeleteDialog } from '@/components/clientes/ClientDeleteDialog';
import { ClientToggleStatusDialog } from '@/components/clientes/ClientToggleStatusDialog';

const telegramStatusLabel: Record<TelegramStatus, string> = {
  no_invitation: 'Sin invitacion',
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  revoked: 'Revocado',
  deletion_pending: 'Eliminacion pendiente',
};

const telegramStatusClass: Record<TelegramStatus, string> = {
  no_invitation: 'bg-muted text-muted-foreground',
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  accepted: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  rejected: 'border-red-300 bg-red-50 text-red-800',
  revoked: 'border-slate-300 bg-slate-100 text-slate-700',
  deletion_pending: 'border-purple-300 bg-purple-50 text-purple-800',
};

export default function Clientes() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'administrador';
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletClient, setWalletClient] = useState<Client | null>(null);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [telegramOnboarding, setTelegramOnboarding] = useState<TelegramOnboarding | null>(null);
  const [telegramClientName, setTelegramClientName] = useState('');
  const [telegramClientId, setTelegramClientId] = useState('');
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [privacyRequestsOpen, setPrivacyRequestsOpen] = useState(false);
  
  // --- NUEVO: ESTADO PARA TELEGRAM ACTIONS ---
  const [telegramActionOpen, setTelegramActionOpen] = useState(false);
  const [telegramActionClient, setTelegramActionClient] = useState<Client | null>(null);
  const [telegramActionLoading, setTelegramActionLoading] = useState(false);

  // Confirmación para toggle activo/inactivo
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [clientToToggle, setClientToToggle] = useState<Client | null>(null);

  // Confirmación para eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const { data: clients = [], isLoading, error: clientsError } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const response = await apiFetch('/clientes');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al obtener clientes');
      return data as Client[];
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 15000,
  });

  const { data: clientTypes = [] } = useQuery({
    queryKey: ['tiposCliente'],
    queryFn: async () => {
      const response = await apiFetch('/clientes/tipos');
      const data = await response.json();
      if (!response.ok) throw new Error('Error fetching tipos');
      return data;
    },
    staleTime: 1000 * 60 * 60,
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['conveniosActivos'],
    queryFn: async () => {
      const response = await apiFetch('/convenios');
      const data = await response.json();
      if (!response.ok) throw new Error('Error fetching convenios');
      return data.filter((c: Convenio) => c.activo);
    },
    staleTime: 1000 * 60 * 60,
  });

  const { data: privacyRequests = [] } = useQuery({
    queryKey: ['privacyRequests'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const response = await apiFetch('/clientes/telegram/privacidad-solicitudes');
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const pendingPrivacyCount = privacyRequests.filter((r: { status: string }) => ['pending', 'in_review'].includes(r.status)).length;

  const error = clientsError ? (clientsError as Error).message : null;

  const fetchClientes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['clientes'] });
  };

  // --- FILTRO DE BÚSQUEDA ---
  const filteredClients = clients.filter((c) => {
    const matchesSearch = 
      `${c.nombre} ${c.apellido}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cedula.includes(searchTerm) ||
      (c.telefono && c.telefono.includes(searchTerm)) ||
      c.correo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || String(c.id_tipo_cliente) === filterType;
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'active' && c.activo) || 
                          (filterStatus === 'inactive' && !c.activo);

    return matchesSearch && matchesType && matchesStatus;
  });

  // --- FORMULARIO: ABRIR NUEVO ---
  const handleOpenNew = () => {
    setEditingClient(null);
    setDialogOpen(true);
  };

  // --- FORMULARIO: ELIMINAR CLIENTE ---
  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const executeDelete = async (force: boolean) => {
    if (!clientToDelete) return;
    setDeleteDialogOpen(false);

    try {
      const endpoint = force ? `/clientes/${clientToDelete.id}/hard-delete` : `/clientes/${clientToDelete.id}`;
      const response = await apiFetch(endpoint, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'Error al eliminar cliente');
        return;
      }
      toast.success(data.message || 'Cliente eliminado correctamente');
      fetchClientes();
    } catch (error) {
      console.error(error);
      toast.error('Error de red al intentar eliminar el cliente');
    } finally {
      setClientToDelete(null);
    }
  };

  // --- FORMULARIO: ABRIR EDICIÓN ---
  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleOpenWallet = (client: Client) => {
    setWalletClient(client);
    setWalletOpen(true);
  };

  const showTelegramOnboarding = (
    onboarding: TelegramOnboarding,
    clientName: string,
    clientId: string,
  ) => {
    setTelegramOnboarding(onboarding);
    setTelegramClientName(clientName);
    setTelegramClientId(clientId);
    setTelegramDialogOpen(true);
  };

  const handleTelegramReinvite = async (clientId: string) => {
    setTelegramActionLoading(true);
    try {
      const response = await apiFetch(`/clientes/${clientId}/telegram/invitacion`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo reinvitar al cliente.');
      await fetchClientes();
      toast.success(
        data.telegram_onboarding?.status === 'sent'
          ? 'Aviso enviado al chat vinculado.'
          : 'Nueva invitación Telegram generada.',
      );
      setTelegramActionOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reinvitar al cliente.');
    } finally {
      setTelegramActionLoading(false);
    }
  };

  const handleTelegramRevoke = async (clientId: string) => {
    setTelegramActionLoading(true);
    try {
      const response = await apiFetch(`/clientes/${clientId}/telegram/revocar`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo revocar al cliente.');
      await fetchClientes();
      toast.success('Acceso revocado correctamente.');
      setTelegramActionOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revocar al cliente.');
    } finally {
      setTelegramActionLoading(false);
    }
  };

  // --- GUARDAR (CREAR O ACTUALIZAR) ---
  const handleSaveSuccess = (data: any, isNew: boolean) => {
    fetchClientes();
    if (isNew && data.telegram_onboarding) {
      showTelegramOnboarding(
        data.telegram_onboarding,
        `${data.nombre} ${data.apellido}`,
        data.id,
      );
    }
  };

  const retryTelegramEmail = async () => {
    if (!telegramClientId) return;
    const client = clients.find((item) => item.id === telegramClientId);
    if (!client) return;
    await handleTelegramReinvite(client.id);
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
        await fetchClientes();

        const nombreCompleto = `${data.nombre} ${data.apellido}`;
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
          {isAdmin && (
            <div className="relative">
              <Button
                onClick={() => setPrivacyRequestsOpen(true)}
                variant="outline"
                className="gap-2 border-terracota text-terracota hover:bg-terracota/10 h-12 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]"
              >
                <ShieldCheck className="h-5 w-5" />
                Gestion de Privacidad
              </Button>
              {pendingPrivacyCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                  {pendingPrivacyCount}
                </span>
              )}
            </div>
          )}
          {isAdmin && (
            <Link to="/trazabilidad">
              <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/10 h-12 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
                <Activity className="h-5 w-5" />
                Trazabilidad
              </Button>
            </Link>
          )}
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
                    placeholder="Nombre, cédula, teléfono o correo..."
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
                  <TableHead className="text-cafe font-bold">Correo</TableHead>
                  <TableHead className="text-cafe font-bold">Telegram</TableHead>
                  <TableHead className="text-cafe font-bold">Estado</TableHead>
                  <TableHead className="text-right text-cafe font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="animate-pulse text-muted-foreground">Cargando clientes...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-destructive">
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
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="max-w-[220px] truncate" title={client.correo}>
                            {client.correo || '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={`w-fit ${telegramStatusClass[client.telegram?.status || 'no_invitation']}`}
                          >
                            {telegramStatusLabel[client.telegram?.status || 'no_invitation']}
                          </Badge>
                          {client.telegram?.status === 'accepted' && !client.telegram.policy_current && (
                            <span className="text-xs text-amber-700">Requiere nueva politica</span>
                          )}
                          {client.telegram?.telegram_username && (
                            <span className="text-xs text-muted-foreground">
                              @{client.telegram.telegram_username}
                            </span>
                          )}
                          {client.telegram?.email_delivery?.status && (
                            <span className="text-xs text-muted-foreground">
                              Correo: {
                                client.telegram.email_delivery.status === 'sent'
                                  ? 'enviado'
                                  : client.telegram.email_delivery.status === 'not_configured'
                                    ? 'sin configurar'
                                    : client.telegram.email_delivery.status === 'failed'
                                      ? 'fallido'
                                      : 'pendiente'
                              }
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.activo ? 'default' : 'secondary'}>
                          {client.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {(!client.convenio && client.id_tipo_cliente === CLIENT_TYPE.DIRECT) && (
                            <Button variant="ghost" size="icon" onClick={() => handleOpenWallet(client)} title="Monedero Virtual">
                              <Wallet className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setTelegramActionClient(client);
                                setTelegramActionOpen(true);
                              }}
                              title="Gestionar Telegram"
                              className="hover:bg-[#24A1DE]/10 hover:text-[#24A1DE]"
                            >
                              <Send className="h-4 w-4 text-[#24A1DE]" />
                            </Button>
                          )}
                          <Switch
                            checked={client.activo}
                            onCheckedChange={() => handleToggleClick(client)}
                          />
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)} title="Editar Cliente">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteClick(client)}
                              title="Eliminar Cliente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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
      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingClient={editingClient}
        clientTypes={clientTypes}
        convenios={convenios}
        isAdmin={isAdmin}
        onSuccess={handleSaveSuccess}
      />

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

      <TelegramOnboardingDialog
        open={telegramDialogOpen}
        onOpenChange={setTelegramDialogOpen}
        clientName={telegramClientName}
        onboarding={telegramOnboarding}
        onRetryEmail={isAdmin ? retryTelegramEmail : undefined}
        retryingEmail={Boolean(telegramActionLoading)}
      />

      {isAdmin && (
        <TelegramPrivacyRequestsDialog
        open={privacyRequestsOpen}
        onOpenChange={setPrivacyRequestsOpen}
        onResolved={fetchClientes}
      />
      )}

      <TelegramActionDialog
        open={telegramActionOpen}
        onOpenChange={setTelegramActionOpen}
        clientName={telegramActionClient ? `${telegramActionClient.nombre} ${telegramActionClient.apellido}` : ''}
        clientId={telegramActionClient?.id || null}
        onInvite={handleTelegramReinvite}
        onRevoke={handleTelegramRevoke}
        isLoading={telegramActionLoading}
      />

      {/* AlertDialog for Delete Confirmation */}
      <ClientDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        clientToDelete={clientToDelete}
        isAdmin={isAdmin}
        onConfirm={executeDelete}
      />

      {/* Confirmación para desactivar */}
      <ClientToggleStatusDialog
        open={isAlertOpen}
        onOpenChange={setIsAlertOpen}
        clientToToggle={clientToToggle}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
