import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Order, OrderState } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Badge } from '@/components/ui/badge';
import { EditOrderDialog } from '@/components/orders/EditOrderDialog';
import { NewOrderDialog } from '@/components/orders/NewOrderDialog';
import { Pencil, CheckCircle, Phone, Search, MessageCircle, Plus, User, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatOrderOptions = (opciones: any) => {
  if (!opciones) return '';
  const techKeys = ['canal', 'menudate', 'tipoorigen', 'tipoalmuerzo', 'whatsappid', 'chatid', 'id_cliente', 'estado'];
  
  const entries = Object.entries(opciones).filter(([k]) => !techKeys.includes(k.toLowerCase()));
  if (entries.length === 0) return '';

  const orderList = ['sopa', 'entrada', 'segundo', 'bebida', 'postre'];
  entries.sort(([k1], [k2]) => {
    const idx1 = orderList.indexOf(k1.toLowerCase());
    const idx2 = orderList.indexOf(k2.toLowerCase());
    if (idx1 !== -1 && idx2 !== -1) return idx1 - idx2;
    if (idx1 !== -1) return -1;
    if (idx2 !== -1) return 1;
    return k1.localeCompare(k2);
  });

  return entries.map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(', ');
};

export default function Pedidos() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'administrador';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; message: string; orderId: string; statusId: number; statusName: string } | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  // --- REACT QUERY CACHE ---
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = today.toISOString();
      today.setHours(23, 59, 59, 999);
      const endOfDay = today.toISOString();
      const response = await apiFetch(`/ordenes?fecha_inicio=${startOfDay}&fecha_fin=${endOfDay}`);
      if (!response.ok) throw new Error('Error al cargar pedidos');
      return response.json();
    },
    staleTime: 1000 * 60 * 2, // La info se considera fresca por 2 minutos
    refetchInterval: 10000, // Autorecarga cada 10 segundos
  });

  const fetchOrders = () => {
    queryClient.invalidateQueries({ queryKey: ['pedidos'] });
  };

  const filteredOrders = orders.filter((order) => {
    // Validar en el cliente que el created_at coincida con la fecha actual local
    const orderDate = new Date(order.created_at).toLocaleDateString();
    const today = new Date().toLocaleDateString();
    if (orderDate !== today) return false;

    const estadoNombre = order.estados_orden?.nombre_estado?.toLowerCase() || 'reservado';
    const matchEstado = filterEstado === 'all' || estadoNombre === filterEstado;
    const tipoClienteReal = order.clientes?.tipos_cliente?.nombre_tipo?.toLowerCase().includes('convenio') ? 'convenio' : 'cliente';
    const matchTipo = filterTipo === 'all' || tipoClienteReal === filterTipo;
    const matchSearch =
      (order.clientes?.nombre + ' ' + order.clientes?.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.clientes?.telefono || '').includes(searchTerm);
    return matchEstado && matchTipo && matchSearch;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aIsReservado = a.id_estado === 1 || !a.id_estado;
    const bIsReservado = b.id_estado === 1 || !b.id_estado;

    // Los reservados siempre van primero
    if (aIsReservado && !bIsReservado) return -1;
    if (!aIsReservado && bIsReservado) return 1;

    // Si tienen la misma prioridad, el más reciente va primero
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEdit = (order: any) => {
    setEditingOrder(order);
    setDialogOpen(true);
  };

  const handleSaveOrder = () => {
    fetchOrders();
    setDialogOpen(false);
  };

  const handleCreateOrder = () => {
    fetchOrders(); // Refresh table after creating
  };

  const handleUpdateStatus = async (orderId: string, newStatusId: number, statusName: string, forceFallback = false) => {
    try {
      const response = await apiFetch(`/ordenes/${orderId}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ id_estado: newStatusId, forceFallback })
      });
      if (response.ok) {
        toast.success(`Pedido marcado como ${statusName}`);
        fetchOrders();
      } else {
        const data = await response.json().catch(() => ({}));
        
        if (response.status === 409 && data.requireConfirmation) {
          setConfirmDialog({
            open: true,
            message: data.error,
            orderId,
            statusId: newStatusId,
            statusName
          });
        } else if (response.status === 400 && (data.error?.includes('saldo') || data.error?.toLowerCase().includes('convenio'))) {
          setErrorDialog(data.error);
        } else {
          toast.error(data.error || 'Error al actualizar el estado');
        }
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const reservedCount = orders.filter((o) => o.estados_orden?.nombre_estado?.toLowerCase() === 'reservado').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Pedidos
          </h1>
          <p className="text-muted-foreground text-lg">Gestión de pedidos diarios</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 shadow-lg shadow-primary/20 animate-pulse-subtle">
            <MessageCircle className="h-5 w-5 text-white" />
            <span className="font-bold text-white text-sm">{reservedCount} pedidos pendientes</span>
          </div>
          <Button onClick={() => navigate('/historial-pedidos')} variant="outline" className="gap-2 border-cafe text-cafe hover:bg-cafe/10 h-11 px-4 rounded-xl font-bold shadow-lg shadow-cafe/5 transition-all">
            <Search className="h-5 w-5" />
            Historial
          </Button>
          <Button onClick={() => setNewOrderOpen(true)} className="gap-2 bg-cafe hover:bg-cafe/90 h-11 px-6 rounded-xl font-bold shadow-lg shadow-cafe/20 transition-all hover:scale-[1.02]">
            <Plus className="h-5 w-5" />
            Nuevo Pedido
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Lista de Pedidos</CardTitle>
          <CardDescription>Filtre y gestione los pedidos del día</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="min-w-[200px] flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="reservado">Reservado</SelectItem>
                <SelectItem value="consumido">Consumido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="convenio">Convenio</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                  <TableHead className="text-cafe font-bold"># Orden</TableHead>
                  <TableHead className="text-cafe font-bold">Cliente</TableHead>
                  <TableHead className="text-cafe font-bold">Tipo de Cliente</TableHead>
                  <TableHead className="text-cafe font-bold">Detalle de Pedido</TableHead>
                  <TableHead className="text-center text-cafe font-bold">Total Productos</TableHead>
                  <TableHead className="text-center text-cafe font-bold">Total ($)</TableHead>
                  <TableHead className="text-cafe font-bold">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Cargando pedidos...
                    </TableCell>
                  </TableRow>
                ) : sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No se encontraron pedidos
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map((order) => (
                    <TableRow key={order.id_orden}>
                      <TableCell>
                        <span className="font-mono text-lg font-bold text-cafe">
                          #{order.numero_orden || order.id_orden?.split('-')[0]?.substring(0, 5).toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{order.clientes?.nombre} {order.clientes?.apellido}</p>
                          {['manual', 'sistema'].some(word => order.origenes_pedido?.nombre_origen?.toLowerCase().includes(word)) && (
                            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-foreground bg-accent/60 rounded-full px-2 py-0.5 w-fit">
                              <User className="h-3.5 w-3.5" />
                              Creado por: <span className="font-bold">{order.creador_nombre}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit bg-primary/5">
                            {order.clientes?.tipos_cliente?.nombre_tipo || 'Cliente'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">
                        {order.detalle_orden && order.detalle_orden.length > 0 ? (
                          <div className="space-y-1">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {order.detalle_orden.map((det: any) => (
                              <div key={det.id_detalle} className="text-sm">
                                <span className="font-medium">
                                  {det.cantidad}x {det.productos?.nombre_producto} <span className="text-muted-foreground font-normal ml-1">(${(det.precio_aplicado || 0).toFixed(2)})</span>
                                </span>
                                {formatOrderOptions(det.opciones) && (
                                  <span className="text-xs text-muted-foreground block mt-0.5">
                                    ({formatOrderOptions(det.opciones)})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : 'Sin detalles'}
                        {order.observaciones && (
                          <div className="mt-2 p-2.5 bg-cafe/5 border-2 border-cafe rounded-xl shadow-md animate-in zoom-in-95 duration-200">
                            <p className="text-[12px] font-black text-cafe leading-snug">
                              <span className="uppercase text-[10px] tracking-widest mr-1.5 opacity-80">Nota:</span>
                              {order.observaciones}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-medium text-foreground">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {order.detalle_orden?.reduce((sum: number, d: any) => sum + d.cantidad, 0) || 0}
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        ${(order.detalle_orden?.reduce((sum: number, d: any) => sum + (d.cantidad * (d.precio_aplicado || 0)), 0) || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={order.id_estado ? order.id_estado.toString() : '1'}
                            disabled={!isAdmin && (order.id_estado === 2 || order.id_estado === 3)}
                            onValueChange={(val) => {
                              const newStatusId = parseInt(val);
                              let statusName = 'reservado';
                              if (newStatusId === 2) statusName = 'consumido';
                              if (newStatusId === 3) statusName = 'cancelado';

                              if (newStatusId === 3) {
                                if (confirm('¿Está seguro que desea cancelar este pedido?')) {
                                  handleUpdateStatus(order.id_orden, newStatusId, statusName);
                                }
                              } else {
                                handleUpdateStatus(order.id_orden, newStatusId, statusName);
                              }
                            }}
                          >
                            <SelectTrigger className={cn(
                              "w-[140px] h-8 text-xs font-bold border-none shadow-sm text-white transition-all",
                              (!order.id_estado || order.id_estado === 1) ? 'bg-oro hover:bg-oro/90' :
                                order.id_estado === 2 ? 'bg-primary hover:bg-primary/90' :
                                  'bg-destructive hover:bg-destructive/90'
                            )}>
                              <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-border shadow-xl">
                              <SelectItem value="1" className="font-bold text-popover-foreground">Reservado</SelectItem>
                              <SelectItem value="2" className="font-bold text-popover-foreground">Consumido</SelectItem>
                              <SelectItem value="3" className="font-bold text-popover-foreground">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            disabled={!isAdmin && (order.id_estado === 2 || order.id_estado === 3)}
                            onClick={() => handleEdit(order)}
                            title="Editar pedido"
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

      <EditOrderDialog 
        order={editingOrder} 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        onSave={handleSaveOrder} 
      />
      
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Atención
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground mt-2">
              {confirmDialog?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (confirmDialog) {
                  handleUpdateStatus(
                    confirmDialog.orderId, 
                    confirmDialog.statusId, 
                    confirmDialog.statusName, 
                    true
                  );
                }
              }}
            >
              Sí, utilizar saldo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!errorDialog} onOpenChange={(open) => !open && setErrorDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Operación denegada
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground mt-2">
              {errorDialog}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialog(null)}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        onCreate={handleCreateOrder}
      />
    </div>
  );
}
