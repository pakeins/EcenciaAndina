import { useState, useEffect } from 'react';
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
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { UtensilsCrossed, CalendarDays, Building2, Users, Loader2, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const CHART_COLORS = ['#2F4D49', '#BF5D30', '#C2803A', '#61603C', '#7A402E'];

export default function Dashboard() {
  const [metricsData, setMetricsData] = useState<{
    almuerzosHoy: number;
    almuerzosHoyTitle?: string;
    almuerzosHoyDesc?: string;
    almuerzosMes: number;
    almuerzosMesTitle?: string;
    almuerzosMesDesc?: string;
    conveniosActivos: number;
    clientesFrecuentes: number;
  } | null>(null);
  const [consumosPorDia, setConsumosPorDia] = useState<{ name: string; value: number }[]>([]);
  const [consumosPorConvenio, setConsumosPorConvenio] = useState<{ name: string; value: number }[]>([]);
  const [actividadReciente, setActividadReciente] = useState<{
    id: string;
    fecha: string;
    cliente: string;
    descripcion: string;
    metodo_pago: string;
    estado: string;
  }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [periodo, setPeriodo] = useState('general');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getPeriodoDates = (p: string) => {
    const today = new Date();
    const formatLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (p === 'hoy') {
      const todayStr = formatLocalDate(today);
      return { inicio: todayStr, fin: todayStr };
    }
    if (p === 'semana') {
      const day = today.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { inicio: formatLocalDate(monday), fin: formatLocalDate(sunday) };
    }
    if (p === 'mes') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { inicio: formatLocalDate(first), fin: formatLocalDate(last) };
    }
    return { inicio: '', fin: '' };
  };

  const fetchDashboardData = async (inicio?: string, fin?: string, showRefreshingSpinner = false) => {
    if (showRefreshingSpinner) setIsRefreshing(true);
    try {
      let url = '/reportes/dashboard';
      if (inicio && fin) {
        url += `?fecha_inicio=${inicio}&fecha_fin=${fin}`;
      }
      const response = await apiFetch(url);
      if (response.ok) {
        const data = await response.json();
        setMetricsData(data.metrics);
        setConsumosPorDia(data.consumosPorDia);
        setConsumosPorConvenio(data.consumosPorConvenio);
        setActividadReciente(data.actividadReciente || []);
        setTopProducts(data.topProducts || []);
      } else {
        toast.error('Error al cargar datos del dashboard');
      }
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      toast.error('Error de conexión con el servidor');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch when period or dates change
  useEffect(() => {
    if (periodo === 'general') {
      fetchDashboardData();
    } else if (periodo === 'personalizado') {
      if (fechaInicio && fechaFin) {
        if (new Date(fechaFin) < new Date(fechaInicio)) {
          toast.error('La fecha final no puede ser anterior a la inicial');
          return;
        }
        fetchDashboardData(fechaInicio, fechaFin);
      }
    } else {
      const dates = getPeriodoDates(periodo);
      fetchDashboardData(dates.inicio, dates.fin);
    }
  }, [periodo, fechaInicio, fechaFin]);

  // Periodic Auto-refresh (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (periodo === 'general') {
        fetchDashboardData(undefined, undefined, false);
      } else if (periodo === 'personalizado') {
        if (fechaInicio && fechaFin && new Date(fechaFin) >= new Date(fechaInicio)) {
          fetchDashboardData(fechaInicio, fechaFin, false);
        }
      } else {
        const dates = getPeriodoDates(periodo);
        fetchDashboardData(dates.inicio, dates.fin, false);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [periodo, fechaInicio, fechaFin]);

  const handlePeriodoChange = (newPeriodo: string) => {
    setPeriodo(newPeriodo);
    if (newPeriodo === 'general') {
      setFechaInicio('');
      setFechaFin('');
      setLoading(true);
    } else if (newPeriodo !== 'personalizado') {
      const dates = getPeriodoDates(newPeriodo);
      setFechaInicio(dates.inicio);
      setFechaFin(dates.fin);
      setLoading(true);
    } else {
      // Default to current week for custom filter inputs
      const dates = getPeriodoDates('semana');
      setFechaInicio(dates.inicio);
      setFechaFin(dates.fin);
      setLoading(true);
    }
  };

  const handleManualRefresh = () => {
    if (periodo === 'general') {
      fetchDashboardData(undefined, undefined, true);
    } else if (periodo === 'personalizado') {
      if (fechaInicio && fechaFin) {
        fetchDashboardData(fechaInicio, fechaFin, true);
      }
    } else {
      const dates = getPeriodoDates(periodo);
      fetchDashboardData(dates.inicio, dates.fin, true);
    }
  };

  const metrics = [
    {
      title: metricsData?.almuerzosHoyTitle ?? 'Almuerzos Hoy',
      value: metricsData?.almuerzosHoy ?? 0,
      icon: UtensilsCrossed,
      description: metricsData?.almuerzosHoyDesc ?? 'Consumidos el día de hoy',
    },
    {
      title: metricsData?.almuerzosMesTitle ?? 'Almuerzos del Mes',
      value: typeof metricsData?.almuerzosMes === 'number' && metricsData?.almuerzosMesTitle?.includes('Ingresos')
        ? `$${metricsData.almuerzosMes.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : (metricsData?.almuerzosMes ?? 0),
      icon: CalendarDays,
      description: metricsData?.almuerzosMesDesc ?? 'Total acumulado mensual',
    },
    {
      title: 'Convenios Activos',
      value: metricsData?.conveniosActivos ?? 0,
      icon: Building2,
      description: 'Empresas con convenio',
    },
    {
      title: 'Clientes',
      value: metricsData?.clientesFrecuentes ?? 0,
      icon: Users,
      description: 'Clientes registrados',
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-terracota" />
        <p className="text-muted-foreground text-sm font-medium animate-pulse">
          Cargando panel de control en tiempo real...
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 p-4 rounded-xl border border-border shadow-sm backdrop-blur-sm">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm font-medium">Panel de analítica y control en tiempo real</p>
        </div>
        
        {/* Filtros de Fecha */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-cafe uppercase tracking-wider">Periodo:</span>
            <Select value={periodo} onValueChange={handlePeriodoChange}>
              <SelectTrigger className="w-[160px] h-9 border-border bg-background">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Vista General</SelectItem>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mes</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodo === 'personalizado' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Input
                type="date"
                className="w-[155px] h-9 border-border bg-background px-3"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
              <span className="text-muted-foreground text-xs font-extrabold">a</span>
              <Input
                type="date"
                className="w-[155px] h-9 border-border bg-background px-3"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          )}

          <Button 
            variant="outline" 
            size="icon" 
            className="h-9 w-9 border-border bg-background text-cafe hover:text-terracota hover:bg-terracota/5 transition-all duration-300"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Actualizar datos"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => {
          const colors = ['border-l-primary', 'border-l-terracota', 'border-l-oro', 'border-l-secondary'];
          const bgColors = ['bg-primary/5', 'bg-terracota/5', 'bg-oro/5', 'bg-secondary/5'];
          const iconColors = ['text-primary', 'text-terracota', 'text-oro', 'text-secondary'];
          
          return (
            <Card 
              key={metric.title} 
              className={cn(
                "border-border shadow-sm border-l-4 hover:scale-[1.02] hover:shadow-md transition-all duration-300 relative overflow-hidden",
                colors[index % colors.length], 
                bgColors[index % bgColors.length],
                index === 0 && "shadow-md ring-1 ring-primary/20" // Resaltar Cuadrante I (Hoy)
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-cafe uppercase tracking-wider">{metric.title}</CardTitle>
                  {index === 0 && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
                <metric.icon className={cn("h-5 w-5", iconColors[index % iconColors.length])} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-foreground">{metric.value}</div>
                <p className="text-xs text-muted-foreground font-medium">{metric.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Consumos por Día */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Consumos por Día</CardTitle>
            <CardDescription>
              {periodo === 'general' 
                ? 'Almuerzos consumidos esta semana' 
                : periodo === 'hoy' 
                  ? 'Almuerzos consumidos hoy' 
                  : 'Almuerzos consumidos en el periodo'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consumosPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" fill="#2F4D49" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Consumos por Convenio */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Consumos por Convenio</CardTitle>
            <CardDescription>
              {periodo === 'general' 
                ? 'Distribución mensual de almuerzos' 
                : 'Distribución de almuerzos en el periodo'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={consumosPorConvenio}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {consumosPorConvenio.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Widgets Inferiores: Actividad Reciente y Productos Populares */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Actividad Reciente */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground flex items-center gap-2 text-xl font-bold">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Actividad Reciente
            </CardTitle>
            <CardDescription>Últimos consumos registrados en tiempo real</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 overflow-y-auto max-h-[350px] pr-2">
            {actividadReciente.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No hay actividad registrada en este periodo</p>
            ) : (
              actividadReciente.map((act) => (
                <div 
                  key={act.id} 
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/30 hover:bg-card/75 hover:scale-[1.01] transition-all duration-200"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">{act.cliente}</p>
                    <p className="text-xs text-muted-foreground font-medium">{act.descripcion}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        {act.metodo_pago}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {new Date(act.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                    {act.estado}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Productos Más Vendidos */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground text-xl font-bold">Productos Más Vendidos</CardTitle>
            <CardDescription>Platos más populares en el periodo seleccionado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            {topProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No hay ventas registradas en este periodo</p>
            ) : (
              topProducts.map((prod, index) => {
                const maxVal = topProducts[0]?.value || 1;
                const pct = (prod.value / maxVal) * 100;
                return (
                  <div key={prod.name} className="space-y-1.5 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-bold">{index + 1}. {prod.name}</span>
                      <span className="text-cafe font-extrabold">{prod.value} uds.</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-terracota rounded-full transition-all duration-500 ease-out" 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
