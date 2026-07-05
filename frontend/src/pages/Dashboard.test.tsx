import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/pages/Dashboard';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Legend: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        metrics: {
          almuerzosHoy: 12,
          almuerzosHoyTitle: 'Almuerzos hoy',
          almuerzosHoyDesc: 'Consumidos el dia de hoy',
          almuerzosMes: 120,
          almuerzosMesTitle: 'Almuerzos del mes',
          almuerzosMesDesc: 'Total acumulado mensual',
          conveniosActivos: 4,
          clientesFrecuentes: 25,
        },
        consumosPorDia: [],
        consumosPorConvenio: [],
        topProducts: [],
      }),
    } as Response);
  });

  it('muestra KPIs reales y estados vacios', async () => {
    renderDashboard();

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.queryByText('Actividad reciente')).not.toBeInTheDocument();
    expect(screen.getByText('No hay ventas registradas en este periodo')).toBeInTheDocument();
    expect(screen.getByText('No hay actividad registrada en este periodo')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/reportes/dashboard');
  });
});
