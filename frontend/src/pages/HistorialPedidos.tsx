import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Search, User, ArrowLeft, Download, FileText, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export default function HistorialPedidos() {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'administrador';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  
  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date filters (default to last 7 days)
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      let queryUrl = '/ordenes';
      if (useDateFilter) {
        // Ajustar fechas localmente para evitar desfases de zona horaria al parsear "YYYY-MM-DD"
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        const [ey, em, ed] = endDate.split('-').map(Number);
        const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        queryUrl += `?fecha_inicio=${start.toISOString()}&fecha_fin=${end.toISOString()}`;
      }
      
      const response = await apiFetch(queryUrl);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        toast.error('Error al cargar historial de pedidos');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [useDateFilter, startDate, endDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter((order) => {
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
    // Para el historial, ordenar siempre por fecha más reciente primero
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const exportToCSV = () => {
    if (sortedOrders.length === 0) {
      toast.error('No hay pedidos para exportar');
      return;
    }
    const headers = ['# Orden', 'Fecha', 'Hora', 'Cliente', 'App Mensajeria', 'Tipo', 'Cantidad', 'Total', 'Estado'];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = sortedOrders.map((order: any) => {
      const d = new Date(order.created_at);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const clientName = `${order.clientes?.nombre || ''} ${order.clientes?.apellido || ''}`.trim();
      const clientPhone = order.clientes?.telefono || '';
      const clientType = order.clientes?.tipos_cliente?.nombre_tipo || 'Cliente';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cant = order.detalle_orden?.reduce((sum: number, d: any) => sum + d.cantidad, 0) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = order.detalle_orden?.reduce((sum: number, d: any) => sum + (d.cantidad * (d.precio_aplicado || 0)), 0) || 0;
      
      const estado = order.estados_orden?.nombre_estado || 'reservado';

      const numOrden = order.numero_orden || order.id_orden?.split('-')[0]?.substring(0, 5).toUpperCase();

      return [
        `"#${numOrden}"`,
        dateStr,
        timeStr,
        `"${clientName}"`,
        `"${clientPhone}"`,
        clientType,
        cant,
        total.toFixed(2),
        estado
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `historial_pedidos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    if (sortedOrders.length === 0) {
      toast.error('No hay pedidos para exportar');
      return;
    }
    const doc = new jsPDF();
    doc.text('Historial de Pedidos', 14, 15);
    
    const tableColumn = ['Fecha', 'Hora', 'Cliente', 'Telefono', 'Tipo', 'Cant', 'Total', 'Estado'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableRows: any[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sortedOrders.forEach((order: any) => {
      const d = new Date(order.created_at);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const clientName = `${order.clientes?.nombre || ''} ${order.clientes?.apellido || ''}`.trim();
      const clientPhone = order.clientes?.telefono || '';
      const clientType = order.clientes?.tipos_cliente?.nombre_tipo || 'Cliente';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cant = order.detalle_orden?.reduce((sum: number, d: any) => sum + d.cantidad, 0) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = order.detalle_orden?.reduce((sum: number, d: any) => sum + (d.cantidad * (d.precio_aplicado || 0)), 0) || 0;
      
      const estado = order.estados_orden?.nombre_estado || 'reservado';

      tableRows.push([
        dateStr,
        timeStr,
        clientName,
        clientPhone,
        clientType,
        cant.toString(),
        `$${total.toFixed(2)}`,
        estado
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [85, 59, 44] } // primary/cafe color approximation
    });

    doc.save(`historial_pedidos_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/pedidos')} className="h-8 w-8 rounded-full bg-secondary/10 hover:bg-secondary/20">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
              Historial de Pedidos
            </h1>
          </div>
          <p className="text-muted-foreground text-lg ml-11">Consulte los pedidos pasados filtrando por fecha</p>
        </div>
        <div className="flex gap-2 mr-2">
          <Button variant="outline" className="gap-2 text-green-700 hover:text-green-800 hover:bg-green-50" onClick={exportToCSV}>
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" className="gap-2 text-red-700 hover:text-red-800 hover:bg-red-50" onClick={exportToPDF}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Búsqueda Avanzada</CardTitle>
          <CardDescription>Seleccione un rango de fechas y filtros adicionales para buscar órdenes</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-6 flex flex-col md:flex-row flex-wrap gap-4 items-end">
            {/* 1. Búsqueda */}
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Buscar Pedido</Label>
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

            {/* 2. Filtro Estado */}
            <div className="space-y-1.5 min-w-[160px]">
              <Label className="text-xs font-bold text-muted-foreground">Estado del Pedido</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="reservado">Reservado</SelectItem>
                  <SelectItem value="consumido">Consumido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 3. Filtro Tipo */}
            <div className="space-y-1.5 min-w-[160px]">
              <Label className="text-xs font-bold text-muted-foreground">Tipo de Cliente</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="convenio">Convenio</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 4. Filtros de Fecha */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 bg-secondary/5 p-3 rounded-md border border-border/50">
              <div className="flex items-center gap-2 mb-2 sm:mb-0 sm:pb-3">
                <Switch id="date-filter-switch" checked={useDateFilter} onCheckedChange={setUseDateFilter} />
                <Label htmlFor="date-filter-switch" className="text-sm font-bold text-muted-foreground cursor-pointer">
                  Filtrar por fechas
                </Label>
              </div>
              
              <div className={cn("flex gap-4 transition-opacity", !useDateFilter && "opacity-50 pointer-events-none")}>
                <div className="space-y-1.5">
                  <Label htmlFor="start-date" className="text-xs font-bold text-muted-foreground">Desde</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    disabled={!useDateFilter}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setStartDate(newStart);
                      if (newStart > endDate) setEndDate(newStart);
                    }}
                    className="w-[140px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date" className="text-xs font-bold text-muted-foreground">Hasta</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    disabled={!useDateFilter}
                    onChange={(e) => {
                      const newEnd = e.target.value;
                      setEndDate(newEnd);
                      if (newEnd < startDate) setStartDate(newEnd);
                    }}
                    className="w-[140px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                  <TableHead className="text-cafe font-bold min-w-[100px]"># Orden</TableHead>
                  <TableHead className="text-cafe font-bold min-w-[150px]">Fecha</TableHead>
                  <TableHead className="text-cafe font-bold min-w-[200px]">Cliente</TableHead>
                  <TableHead className="text-cafe font-bold">Tipo</TableHead>
                  <TableHead className="text-cafe font-bold min-w-[250px]">Detalle</TableHead>
                  <TableHead className="text-center text-cafe font-bold">Cant.</TableHead>
                  <TableHead className="text-center text-cafe font-bold">Total ($)</TableHead>
                  <TableHead className="text-cafe font-bold min-w-[180px]">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Buscando en el historial...
                    </TableCell>
                  </TableRow>
                ) : sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No se encontraron pedidos en el rango seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map((order, index) => {
                    const dateObj = new Date(order.created_at);
                    const dateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    const prevDateStr = index > 0 
                      ? new Date(sortedOrders[index - 1].created_at).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) 
                      : null;
                    const showDateSeparator = dateStr !== prevDateStr;

                    return (
                      <Fragment key={order.id_orden}>
                        {showDateSeparator && (
                          <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                            <TableCell colSpan={8} className="text-center font-bold text-cafe py-3 capitalize text-sm shadow-sm">
                              {dateStr}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell>
                            <span className="font-mono text-lg font-bold text-cafe">
                              #{order.numero_orden || order.id_orden?.split('-')[0]?.substring(0, 5).toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="font-bold text-foreground whitespace-nowrap">
                            {dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{order.clientes?.nombre} {order.clientes?.apellido}</p>
                          {['manual', 'sistema'].some(word => order.origenes_pedido?.nombre_origen?.toLowerCase().includes(word)) && (
                            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-foreground bg-accent/60 rounded-full px-2 py-0.5 w-fit">
                              <User className="h-3.5 w-3.5" />
                              <span className="font-bold truncate max-w-[120px]">{order.creador_nombre}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="w-fit bg-primary/5">
                          {order.clientes?.tipos_cliente?.nombre_tipo || 'Cliente'}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-foreground", order.id_estado === 3 && "opacity-50 line-through")}>
                        {order.detalle_orden && order.detalle_orden.length > 0 ? (
                          <div className="space-y-1">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {order.detalle_orden.map((det: any) => (
                              <div key={det.id_detalle} className="text-sm">
                                <span className="font-medium">
                                  {det.cantidad}x {det.productos?.nombre_producto}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : 'Sin detalles'}
                      </TableCell>
                      <TableCell className={cn("text-center font-medium", order.id_estado === 3 ? "text-muted-foreground line-through opacity-60" : "text-foreground")}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {order.detalle_orden?.reduce((sum: number, d: any) => sum + d.cantidad, 0) || 0}
                      </TableCell>
                      <TableCell className={cn("text-center font-bold", order.id_estado === 3 ? "text-muted-foreground line-through opacity-60" : "text-primary")}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        ${(order.detalle_orden?.reduce((sum: number, d: any) => sum + (d.cantidad * (d.precio_aplicado || 0)), 0) || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={cn(
                            "w-[100px] flex justify-center text-xs font-bold border-none shadow-sm text-white",
                            (!order.id_estado || order.id_estado === 1) ? 'bg-oro' :
                            order.id_estado === 2 ? 'bg-primary' :
                            'bg-destructive'
                          )}
                        >
                          {order.estados_orden?.nombre_estado || 'Reservado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                  );
                })
              )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
