import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode, value: string, onValueChange: (val: string) => void }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)} data-testid="select-periodo">
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode, value: string }) => <option value={value}>{children}</option>,
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
  const mockMetrics = {
    metrics: {
      almuerzosHoy: 12,
      almuerzosHoyTitle: 'Almuerzos hoy',
      almuerzosHoyDesc: 'Consumidos el dia de hoy',
      almuerzosMes: 120,
      almuerzosMesTitle: 'Almuerzos del mes',
      almuerzosMesDesc: 'Total acumulado mensual',
      conveniosActivos: 4,
      clientesRegistrados: 25,
      clientesConvenioActivos: 15,
      clientesParticularesActivos: 10,
      consumidosHoy: 12,
      conveniosHoy: 8,
      frecuentesHoy: 4,
    },
    consumosPorDia: [{ name: 'Lunes', value: 10 }],
    consumosPorConvenio: [{ name: 'Empresa A', value: 20 }],
    topProducts: [{ name: 'Seco', value: 5 }],
    actividadReciente: [
      {
        id: 'ord-1',
        fecha: '2026-07-08T12:00:00Z',
        cliente: 'Juan Perez',
        estado: 'Consumido',
        metodo_pago: 'Efectivo',
        descripcion: 'Almuerzo Ejecutivo',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    } as Response);
  });

  it('muestra KPIs reales y estados cargados', async () => {
    renderDashboard();

    expect((await screen.findAllByText(/Almuerzos de Hoy/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Consumos de Convenio/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Consumos de Particulares/i).length).toBeGreaterThan(0);
    expect(screen.getByText('12')).toBeInTheDocument(); // almuerzosHoy value
    expect(screen.getByText('120')).toBeInTheDocument(); // almuerzosMes value
    expect(apiFetch).toHaveBeenCalledWith('/reportes/dashboard');
  });

  it('permite cambiar el periodo de consulta y vuelve a consultar la API', async () => {
    renderDashboard();

    // Esperar a que se renderice
    await screen.findAllByText(/Almuerzos de Hoy/i);

    // Cambiar a "hoy"
    const select = screen.getByTestId('select-periodo');
    fireEvent.change(select, { target: { value: 'hoy' } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('fecha_inicio='));
    });
  });

  it('permite cambiar al periodo personalizado y filtrar por fechas manuales', async () => {
    const { container } = renderDashboard();

    // Esperar a que se renderice
    await screen.findAllByText(/Almuerzos de Hoy/i);

    // Cambiar a "personalizado"
    const select = screen.getByTestId('select-periodo');
    fireEvent.change(select, { target: { value: 'personalizado' } });

    // Esperar a que aparezcan los inputs de fecha (que se renderizan de forma condicional)
    await waitFor(() => {
      const inputs = container.querySelectorAll('input[type="date"]');
      expect(inputs.length).toBe(2);
    });

    vi.mocked(apiFetch).mockClear();

    // Cambiar el primer input (fechaInicio)
    const inputsBefore = container.querySelectorAll('input[type="date"]');
    fireEvent.change(inputsBefore[0], { target: { value: '2026-07-01' } });

    // Esperar a que el query finalice y los elementos vuelvan a estar en el DOM
    await screen.findAllByText(/Almuerzos de Hoy/i);

    // Cambiar el segundo input (fechaFin)
    const inputsAfter = container.querySelectorAll('input[type="date"]');
    fireEvent.change(inputsAfter[1], { target: { value: '2026-07-15' } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('fecha_inicio=2026-07-01&fecha_fin=2026-07-15'));
    });
  });

  it('permite recargar los datos manualmente al hacer clic en el boton de actualizar', async () => {
    renderDashboard();

    await screen.findAllByText(/Almuerzos de Hoy/i);
    vi.mocked(apiFetch).mockClear();

    const refreshBtn = screen.getByTitle('Actualizar datos');
    fireEvent.click(refreshBtn);

    expect(apiFetch).toHaveBeenCalled();
  });
});
