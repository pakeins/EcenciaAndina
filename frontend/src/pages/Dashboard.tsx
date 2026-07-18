import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  UtensilsCrossed,
  CalendarDays,
  Building2,
  Users,
  Loader2,
  RefreshCw,
  ChefHat,
  Leaf,
  ListPlus,
  Soup,
  Sparkles,
  PackagePlus,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  UserSquare2,
} from 'lucide-react';
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
  Sector,
} from 'recharts';

const CHART_COLORS = ['#2F4D49', '#BF5D30', '#C2803A', '#61603C', '#7A402E'];

export default function Dashboard() {
  const [periodo, setPeriodo] = useState('general');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

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

  const { data, isLoading: loading, isFetching: isRefreshing, refetch } = useQuery({
    queryKey: ['dashboard', periodo, fechaInicio, fechaFin],
    queryFn: async () => {
      let inicio: string | undefined = undefined;
      let fin: string | undefined = undefined;

      if (periodo === 'personalizado') {
        if (!fechaInicio || !fechaFin || new Date(fechaFin) < new Date(fechaInicio)) {
          return null; // Fechas invalidas, no buscar o devolver nulo
        }
        inicio = fechaInicio;
        fin = fechaFin;
      } else if (periodo !== 'general') {
        const dates = getPeriodoDates(periodo);
        inicio = dates.inicio;
        fin = dates.fin;
      }

      let url = '/reportes/dashboard';
      if (inicio && fin) {
        url += `?fecha_inicio=${inicio}&fecha_fin=${fin}`;
      }
      const response = await apiFetch(url);
      if (!response.ok) {
        throw new Error('Error al cargar datos del dashboard');
      }
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const metricsData = data?.metrics || null;
  const consumosPorDia = data?.consumosPorDia || [];
  const consumosPorConvenio = data?.consumosPorConvenio || [];
  const actividadReciente = data?.actividadReciente || [];

  const handlePeriodoChange = (newPeriodo: string) => {
    setPeriodo(newPeriodo);
    if (newPeriodo === 'general') {
      setFechaInicio('');
      setFechaFin('');
    } else if (newPeriodo !== 'personalizado') {
      const dates = getPeriodoDates(newPeriodo);
      setFechaInicio(dates.inicio);
      setFechaFin(dates.fin);
    } else {
      // Default to current week for custom filter inputs
      const dates = getPeriodoDates('semana');
      setFechaInicio(dates.inicio);
      setFechaFin(dates.fin);
    }
  };

  const handleManualRefresh = () => {
    refetch();
  };

  const metrics = [
    {
      title: 'Almuerzos de Hoy',
      value: metricsData?.consumidosHoy ?? 0,
      icon: CheckCircle2,
      description: 'Total consumidos el día de hoy',
    },
    {
      title: 'Almuerzos del Mes',
      value: metricsData?.almuerzosMes ?? 0,
      icon: CalendarDays,
      description: 'Total consumidos en el mes',
    },
    {
      title: 'Consumos de Convenio',
      value: metricsData?.conveniosHoy ?? 0,
      icon: Building2,
      description: 'Pedidos corporativos del periodo',
    },
    {
      title: 'Consumos de Particulares',
      value: metricsData?.frecuentesHoy ?? 0,
      icon: UserSquare2,
      description: 'Pedidos particulares del periodo',
    },
    {
      title: 'Convenios Activos',
      value: metricsData?.conveniosActivos ?? 0,
      icon: ClipboardList,
      description: 'Empresas afiliadas al sistema',
    },
    {
      title: 'Clientes Activos',
      value: metricsData?.clientesRegistrados ?? 0,
      icon: Users,
      description: `${metricsData?.clientesConvenioActivos || 0} corporativos | ${metricsData?.clientesParticularesActivos || 0} particulares`,
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
            <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Input
                type="date"
                className="w-full sm:w-[155px] h-9 border-border bg-background px-3"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
              <span className="text-muted-foreground text-xs font-extrabold">a</span>
              <Input
                type="date"
                className="w-full sm:w-[155px] h-9 border-border bg-background px-3"
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric, index) => {
          return (
            <Card 
              key={metric.title} 
              className="border-border shadow-sm border-l-4 border-l-terracota bg-card hover:scale-[1.02] hover:shadow-md transition-all duration-300 relative overflow-hidden"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <CardTitle className="text-[11px] font-bold text-cafe uppercase tracking-wider truncate" title={metric.title}>{metric.title}</CardTitle>
                </div>
                <div className="h-6 w-6 rounded-full bg-terracota/10 flex items-center justify-center shrink-0">
                  <metric.icon className="h-3.5 w-3.5 text-terracota" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-black text-foreground">{metric.value}</div>
                <p className="text-[10px] text-muted-foreground font-medium truncate" title={metric.description}>{metric.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        {/* Consumos por Día */}
        <Card className="min-w-0 border-border">
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
            <div className="h-[300px] min-h-[300px] w-full min-w-0">
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
                  <Bar dataKey="value" fill="#BF5D30" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Consumos por Convenio */}
        <Card className="min-w-0 border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Consumos por Convenio</CardTitle>
            <CardDescription>
              {periodo === 'general' 
                ? 'Distribución mensual de almuerzos' 
                : 'Distribución de almuerzos en el periodo'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] min-h-[300px] w-full min-w-0">
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
                    {consumosPorConvenio.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
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
        {/* Efectividad de Pedidos */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-terracota" />
              Efectividad de Pedidos
            </CardTitle>
            <CardDescription>Comparativa de almuerzos solicitados vs consumidos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-center">
            {metricsData?.totalHoy === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No hay pedidos en este periodo</p>
            ) : (
              <div className="space-y-6 pt-2">
                <div className="flex flex-col space-y-4 pt-2">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary"></span> Consumidos ({metricsData?.consumidosHoy || 0})</span>
                    <span className="font-medium flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-oro"></span> Pendientes ({metricsData?.pendientesHoy || 0})</span>
                    <span className="font-medium flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-terracota"></span> Cancelados ({metricsData?.canceladosHoy || 0})</span>
                  </div>
                  
                  <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex shadow-inner">
                    <div 
                      className="bg-primary transition-all duration-500 hover:brightness-110" 
                      style={{ width: `${((metricsData?.consumidosHoy || 0) / (metricsData?.totalHoy || 1)) * 100}%` }}
                      title={`Consumidos: ${metricsData?.consumidosHoy || 0}`}
                    />
                    <div 
                      className="bg-oro transition-all duration-500 hover:brightness-110" 
                      style={{ width: `${((metricsData?.pendientesHoy || 0) / (metricsData?.totalHoy || 1)) * 100}%` }}
                      title={`Pendientes: ${metricsData?.pendientesHoy || 0}`}
                    />
                    <div 
                      className="bg-terracota transition-all duration-500 hover:brightness-110" 
                      style={{ width: `${((metricsData?.canceladosHoy || 0) / (metricsData?.totalHoy || 1)) * 100}%` }}
                      title={`Cancelados: ${metricsData?.canceladosHoy || 0}`}
                    />
                  </div>
                </div>

                <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 text-center">
                  <p className="text-sm font-medium text-cafe">
                    Tasa de conversión: <span className="font-bold text-terracota">{Math.round(((metricsData?.consumidosHoy || 0) / (metricsData?.totalHoy || 1)) * 100)}%</span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tipos de Almuerzo Más Pedidos */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground text-xl font-bold">Tipos de Almuerzo Más Pedidos</CardTitle>
            <CardDescription>Top de tipos de almuerzo en el periodo seleccionado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            {(() => {
              const topLunches = [
                { name: 'Ejecutivo Completo', value: metricsData?.ejecutivoCompleto || 0 },
                { name: 'Ejecutivo Sin Sopa', value: metricsData?.ejecutivoSinSopa || 0 },
                { name: 'Ejecutivo Simple', value: metricsData?.ejecutivoSimple || 0 },
                { name: 'Almuerzo del Día', value: metricsData?.almuerzoDia || 0 },
                { name: 'Almuerzo Día Simple', value: metricsData?.almuerzoDiaSimple || 0 },
              ].filter(l => l.value > 0).sort((a, b) => b.value - a.value);

              if (topLunches.length === 0) {
                return <p className="text-muted-foreground text-sm py-4 text-center">No hay ventas registradas en este periodo</p>;
              }

              return topLunches.map((lunch, index) => {
                const maxVal = topLunches[0]?.value || 1;
                const pct = (lunch.value / maxVal) * 100;
                return (
                  <div key={lunch.name} className="space-y-1.5 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-bold">{index + 1}. {lunch.name}</span>
                      <span className="text-cafe font-extrabold">{lunch.value} uds.</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500 ease-out" 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
