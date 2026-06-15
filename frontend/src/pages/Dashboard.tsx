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
import { getPeriodRange, isInvalidDateRange } from '@/lib/reporting';
import { DashboardResponse } from '@/types/reporting';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Loader2,
  RefreshCw,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_COLORS = ['#2F4D49', '#BF5D30', '#C2803A', '#61603C', '#7A402E'];

const fetchDashboard = async (startDate: string, endDate: string): Promise<DashboardResponse> => {
  const query = startDate && endDate
    ? `?fecha_inicio=${encodeURIComponent(startDate)}&fecha_fin=${encodeURIComponent(endDate)}`
    : '';
  const response = await apiFetch(`/reportes/dashboard${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar el dashboard');
  return data;
};

export default function Dashboard() {
  const [period, setPeriod] = useState('general');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const quickRange = getPeriodRange(period);
  const startDate = period === 'personalizado' ? customStart : quickRange.start;
  const endDate = period === 'personalizado' ? customEnd : quickRange.end;
  const invalidRange = isInvalidDateRange(startDate, endDate);
  const queryEnabled = period !== 'personalizado' || Boolean(startDate && endDate && !invalidRange);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard-reporting', startDate, endDate],
    queryFn: () => fetchDashboard(startDate, endDate),
    enabled: queryEnabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const data = dashboardQuery.data;
  const metrics = [
    {
      title: data?.metrics.almuerzosHoyTitle || 'Almuerzos hoy',
      value: data?.metrics.almuerzosHoy || 0,
      description: data?.metrics.almuerzosHoyDesc || 'Consumidos el dia de hoy',
      icon: UtensilsCrossed,
    },
    {
      title: data?.metrics.almuerzosMesTitle || 'Almuerzos del mes',
      value: data?.metrics.almuerzosMesTitle.toLowerCase().includes('ingresos')
        ? `$${Number(data.metrics.almuerzosMes).toLocaleString('es-EC', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : data?.metrics.almuerzosMes || 0,
      description: data?.metrics.almuerzosMesDesc || 'Total acumulado mensual',
      icon: CalendarDays,
    },
    {
      title: 'Convenios activos',
      value: data?.metrics.conveniosActivos || 0,
      description: 'Empresas con convenio vigente',
      icon: Building2,
    },
    {
      title: 'Clientes frecuentes',
      value: data?.metrics.clientesFrecuentes || 0,
      description: 'Clientes frecuentes activos',
      icon: Users,
    },
  ];

  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    if (value === 'personalizado' && (!customStart || !customEnd)) {
      const currentMonth = getPeriodRange('mes');
      setCustomStart(currentMonth.start);
      setCustomEnd(currentMonth.end);
    }
  };

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex min-h-[450px] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-terracota" />
        <p className="text-sm font-medium text-muted-foreground">Cargando analitica operativa...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-r from-cafe to-terracota bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            Panel de analitica y control con datos reales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="h-9 w-[170px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Vista general</SelectItem>
              <SelectItem value="hoy">Hoy</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mes</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {period === 'personalizado' && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Fecha inicial"
                type="date"
                className={cn('h-9 w-[155px] bg-background', invalidRange && 'border-destructive')}
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <span className="text-xs font-bold text-muted-foreground">a</span>
              <Input
                aria-label="Fecha final"
                type="date"
                className={cn('h-9 w-[155px] bg-background', invalidRange && 'border-destructive')}
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          )}

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => dashboardQuery.refetch()}
            disabled={!queryEnabled || dashboardQuery.isFetching}
            title="Actualizar datos"
          >
            <RefreshCw className={cn('h-4 w-4', dashboardQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {invalidRange && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          La fecha final no puede ser anterior a la fecha inicial.
        </div>
      )}

      {dashboardQuery.isError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {dashboardQuery.error.message}
          </div>
          <Button variant="outline" size="sm" onClick={() => dashboardQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric, index) => {
              const colors = ['border-l-primary', 'border-l-terracota', 'border-l-oro', 'border-l-secondary'];
              const backgrounds = ['bg-primary/5', 'bg-terracota/5', 'bg-oro/5', 'bg-secondary/5'];
              const iconColors = ['text-primary', 'text-terracota', 'text-oro', 'text-secondary'];
              return (
                <Card
                  key={metric.title}
                  className={cn(
                    'border-l-4 border-border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                    colors[index],
                    backgrounds[index],
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-cafe">
                      {metric.title}
                    </CardTitle>
                    <metric.icon className={cn('h-5 w-5', iconColors[index])} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black text-foreground">{metric.value}</div>
                    <p className="text-xs font-medium text-muted-foreground">{metric.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Consumos por dia</CardTitle>
                <CardDescription>Almuerzos consumidos en el periodo seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                {data.consumosPorDia.length ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.consumosPorDia}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                        <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip />
                        <Bar dataKey="value" name="Almuerzos" fill="#2F4D49" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-20 text-center text-sm text-muted-foreground">No hay consumos en el periodo.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consumos por convenio</CardTitle>
                <CardDescription>Distribucion de almuerzos consumidos</CardDescription>
              </CardHeader>
              <CardContent>
                {data.consumosPorConvenio.length ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.consumosPorConvenio}
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {data.consumosPorConvenio.map((point, index) => (
                            <Cell key={point.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-20 text-center text-sm text-muted-foreground">No hay consumos por convenio.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reservados vs consumidos</CardTitle>
                <CardDescription>Pedidos creados y consumos confirmados por dia</CardDescription>
              </CardHeader>
              <CardContent>
                {data.reservasVsConsumos.length ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.reservasVsConsumos}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                        <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="reservados" name="Reservados" fill="#C2803A" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="consumidos" name="Consumidos" fill="#2F4D49" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">No hay reservas ni consumos.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Productos mas vendidos</CardTitle>
                <CardDescription>Unidades consumidas en el periodo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.topProducts.length ? (
                  data.topProducts.map((product, index) => {
                    const maxValue = data.topProducts[0]?.value || 1;
                    return (
                      <div key={product.name} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold">{index + 1}. {product.name}</span>
                          <span className="font-extrabold text-cafe">{product.value} uds.</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-terracota"
                            style={{ width: `${(product.value / maxValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">No hay productos vendidos.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
