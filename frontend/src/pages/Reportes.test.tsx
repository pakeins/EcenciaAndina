/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Reportes from './Reportes';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Mock dependencies
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('@/lib/html', () => ({
  escapeHtml: (str: string) => str,
  formatMoney: (val: number) => (val ?? 0).toFixed(2),
  openPrintWindow: () => ({ focus: vi.fn(), print: vi.fn() }),
  toFiniteNumber: (val: any) => Number(val) || 0,
}));

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    FileDown: mockComponent('file-down'),
    Calendar: mockComponent('calendar'),
    Filter: mockComponent('filter'),
    FileText: mockComponent('file-text'),
    PieChart: mockComponent('pie-chart'),
    Users: mockComponent('users'),
    Building2: mockComponent('building'),
    TrendingUp: mockComponent('trending-up'),
    Plus: mockComponent('plus'),
    Pencil: mockComponent('pencil'),
    Trash2: mockComponent('trash'),
    Search: mockComponent('search'),
    UserPlus: mockComponent('user-plus'),
    ArrowLeft: mockComponent('arrow-left'),
    ShieldCheck: mockComponent('shield-check'),
    Eye: mockComponent('eye'),
    Upload: mockComponent('upload'),
    History: mockComponent('history'),
    X: mockComponent('x'),
    Mail: mockComponent('mail'),
    Phone: mockComponent('phone'),
    Check: mockComponent('check'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
  };
});

// Mock URL.createObjectURL for XML/CSV exports
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-url');

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Reportes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Reportes />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y carga catalogos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Reportes y Estadísticas')).toBeInTheDocument();
    });
  });

  it('valida el rango de fechas al generar reporte', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    await renderComponent();

    const dateInputs = document.querySelectorAll('input[type="date"]');
    
    // Simular cambio de fechas
    fireEvent.change(dateInputs[0], { target: { value: '2026-07-15' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-07-10' } });

    const btnGenerar = screen.getByText('Generar Reporte');
    fireEvent.click(btnGenerar);

    // Toast error mock check (we mock toast but just check that apiFetch wasn't called)
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/reportes/ventas'));
  });

  it('permite generar reporte de ventas e interactuar con exportacion', async () => {
    const mockVentas = [{
      metodo_pago: 'Efectivo', almuerzosPrincipales: 10, ejecutivoCompleto: 5,
      ejecutivoSinSopa: 5, ejecutivoSimple: 0, almuerzoDia: 0, almuerzoDiaSimple: 0,
      otrosAlmuerzos: 0, extrasCantidad: 2, valorExtras: 10, totalConsumo: 110,
    }];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVentas) });
    });

    await renderComponent();

    const btnGenerar = screen.getByText('Generar Reporte');
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });

    // Clic en botones de exportación (Ventas)
    const exportBtns = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV') || 
      b.textContent?.includes('Exportar XML')
    );
    expect(exportBtns.length).toBeGreaterThan(0);
    exportBtns.forEach(btn => fireEvent.click(btn));
  });

  it('permite generar reporte de convenios y exportar', async () => {
    const mockVentasConvenios = [{
      cedula: '1234567890',
      empleado: 'Juan Perez',
      total: 110,
      consumos: [
        { fecha: '2026-07-01', producto: 'Almuerzo Ejecutivo', cantidad: 10, valor: 110 }
      ]
    }];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/reporte') || url.includes('/reportes/')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVentasConvenios) });
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVentasConvenios) });
    });

    await renderComponent();

    // Cambiar a la pestaña de convenios (via combobox)
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]); // El primer combobox es Tipo de Reporte
    
    // Seleccionar 'convenio'
    const option = await screen.findByText('Consolidado por Convenio');
    fireEvent.click(option);

    // Debe aparecer el segundo combobox para elegir la empresa
    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(1);
    });

    // Cambiar el select del convenio
    const convCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.click(convCombobox); // Abrir

    // Esperar a que aparezca la opción de Empresa A y clickearla
    const empOption = await screen.findByRole('option', { name: /Empresa A/i });
    fireEvent.click(empOption);

    // Click generar
    const btnGenerar = screen.getAllByText('Generar Reporte')[0]; // Toma el primero visible
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });

    // Exportar con desglosar = false (por defecto)
    const exportBtns = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV') || 
      b.textContent?.includes('Exportar XML')
    );
    exportBtns.forEach(btn => fireEvent.click(btn));

    // Toggle desglosarConvenio
    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    // Clic en botones de exportación (Convenios)
    const exportBtns2 = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV') || 
      b.textContent?.includes('Exportar XML')
    );
    exportBtns2.forEach(btn => fireEvent.click(btn));
  });

  it('permite generar reporte de estados y exportar', async () => {
    const mockEstados = [{
      fecha: '2026-07-01T12:00:00Z',
      cliente: 'Maria Lopez',
      estado: 'Entregado',
      descripcion: 'Almuerzo Ejecutivo',
      totalConsumo: 15.5
    }];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEstados) });
    });

    await renderComponent();

    // Cambiar a pestaña estados
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);
    const option = await screen.findByText('Pedidos por Estado');
    fireEvent.click(option);

    // Seleccionar estado especifico o dejar en "all"
    const btnGenerar = screen.getByText('Generar Reporte');
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });

    const exportBtns = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV') || 
      b.textContent?.includes('Facturación (XML)')
    );
    exportBtns.forEach(btn => fireEvent.click(btn));
  });

  it('permite generar reporte de productos y exportar', async () => {
    const mockProductos = [{
      nombre: 'Almuerzo Dia',
      categoria: 'Almuerzos',
      cantidadVendida: 25,
      ingresosGenerados: 112.5
    }];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProductos) });
    });

    await renderComponent();

    // Cambiar a pestaña productos
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);
    const option = await screen.findByText('Popularidad de Productos');
    fireEvent.click(option);

    const btnGenerar = screen.getByText('Generar Reporte');
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });

    const exportBtns = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV')
    );
    exportBtns.forEach(btn => fireEvent.click(btn));
  });

  it('permite generar reporte de clientes y exportar', async () => {
    const mockClientesReport = [{
      fecha: '2026-07-02T12:00:00Z',
      convenio: 'Empresa A',
      estado: 'Completado',
      descripcion: '1x Almuerzo Ejecutivo',
      totalConsumo: 6.99
    }];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', id_cliente: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.endsWith('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', id_convenio: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockClientesReport) });
    });

    await renderComponent();

    // Cambiar a pestaña clientes
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);
    const option = await screen.findByText('Consumos por Cliente');
    fireEvent.click(option);

    // Debe aparecer el combobox de cliente
    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(1);
    });

    const cliCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.click(cliCombobox);

    const cliOption = await screen.findByRole('option', { name: /Juan Perez/i });
    fireEvent.click(cliOption);

    const btnGenerar = screen.getAllByText('Generar Reporte')[0];
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });

    const exportBtns = screen.getAllByRole('button').filter(b => 
      b.textContent?.includes('Exportar PDF') || 
      b.textContent?.includes('Exportar CSV') || 
      b.textContent?.includes('Facturación (XML)')
    );
    exportBtns.forEach(btn => fireEvent.click(btn));
  });
});
