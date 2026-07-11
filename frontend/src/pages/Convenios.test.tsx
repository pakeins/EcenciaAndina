/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Convenios from './Convenios';
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

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    Plus: mockComponent('plus'),
    Pencil: mockComponent('pencil'),
    Users: mockComponent('users'),
    Building2: mockComponent('building'),
    Mail: mockComponent('mail'),
    Phone: mockComponent('phone'),
    CalendarDays: mockComponent('calendar'),
    Trash2: mockComponent('trash'),
    Search: mockComponent('search'),
    UserPlus: mockComponent('user-plus'),
    ArrowLeft: mockComponent('arrow-left'),
    FileDown: mockComponent('file-down'),
    ShieldCheck: mockComponent('shield-check'),
    Eye: mockComponent('eye'),
    Upload: mockComponent('upload'),
    History: mockComponent('history'),
    FileText: mockComponent('file-text'),
    X: mockComponent('x'),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Convenios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Convenios />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y maneja carga de datos', async () => {
    const mockConvenios = [
      {
        id: 'conv1',
        ruc: '1799999999001',
        nombre_empresa: 'Empresa A',
        representante: 'Juan',
        telefono: '099',
        email: 'a@a.com',
        fecha_inicio: '2023-01-01',
        fecha_caducidad: '2026-12-31',
        cupo_maximo: 50,
        tipos_almuerzo_permitidos: ['almuerzo_completo'],
        activo: true,
      }
    ];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/productos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id_categoria: 1, nombre: 'Almuerzo Completo', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConvenios) });
    });

    await renderComponent();

    // Validar renderizado básico
    await waitFor(() => {
      expect(screen.getByText('Convenios')).toBeInTheDocument();
      expect(screen.getByText('Empresa A')).toBeInTheDocument();
      expect(screen.getByText(/1799999999001/i)).toBeInTheDocument();
    });
  });

  it('permite abrir el modal de nuevo convenio y guardar', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init && init.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'conv2', ruc: '0999999999001', nombre_empresa: 'Empresa B', fecha_inicio: '2024-01-01', fecha_caducidad: '2025-01-01', cupo_maximo: 10, tipos_almuerzo_permitidos: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();
    
    // Abrir modal
    const btnNuevo = await screen.findByText('Nuevo Convenio');
    fireEvent.click(btnNuevo);
    
    await waitFor(() => {
      // Find the dialog itself
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click cancelar para cerrar
    const btnCancel = screen.getByText('Cancelar');
    fireEvent.click(btnCancel);
  });

  it('permite abrir modales de edición, reporte y otros', async () => {
    // Mock window.open for PDF generation
    global.window.open = vi.fn().mockReturnValue({
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn()
    }) as any;

    const mockConvenios = [
      { id: 'conv1', ruc: '1799999999001', nombre_empresa: 'Empresa A', fecha_inicio: '2023-01-01', fecha_caducidad: '2026-12-31', activo: true, tipos_almuerzo_permitidos: [] }
    ];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/reporte')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ cedula: '123', empleado: 'Juan', total: 10, consumos: [] }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConvenios) });
    });

    await renderComponent();
    
    // Editar
    const btnEditar = await screen.findByText('Editar');
    fireEvent.click(btnEditar);
    
    // Cerrar dialog (puede haber varios Cancelar, tomamos el del dialog)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Cancelar')[0]);
    
    // Generar Reporte
    const btnReporte = screen.getByText('Generar Reporte');
    fireEvent.click(btnReporte);

    // Generar Contrato (Exportar PDF)
    const btnContrato = screen.getByText('Generar Contrato');
    fireEvent.click(btnContrato);
    
    // Switch de activo
    const switches = screen.getAllByRole('switch', { hidden: true });
    if (switches.length > 0) {
      fireEvent.click(switches[0]);
    }
  });

  it('permite renovar un convenio vencido', async () => {
    const mockConvenioVencido = [
      { id: 'conv1', ruc: '1799999999001', nombre_empresa: 'Empresa Vencida', fecha_inicio: '2020-01-01', fecha_caducidad: '2021-01-01', activo: true, tipos_almuerzo_permitidos: [] }
    ];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init && init.method === 'POST' && url.includes('/renovar')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Renovado' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConvenioVencido) });
    });

    await renderComponent();

    // El botón para renovar es en realidad el toggle (switch) de estado que al estar vencido abre el modal
    const switches = screen.getAllByRole('switch', { hidden: true });
    fireEvent.click(switches[0]);

    await waitFor(() => expect(screen.getByText('Renovación de Convenio')).toBeInTheDocument());

    const btnRenovarConfirm = screen.getByRole('button', { name: 'Renovar y Activar' });
    
    await act(async () => {
      fireEvent.click(btnRenovarConfirm);
    });
  });

  it('permite generar un reporte de consumos', async () => {
    const mockConvenios = [
      { id: 'conv1', ruc: '1799999999001', nombre_empresa: 'Empresa A', fecha_inicio: '2023-01-01', fecha_caducidad: '2026-12-31', activo: true, tipos_almuerzo_permitidos: [] }
    ];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/reporte')) {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve([
            { cedula: '123', empleado: 'Juan', total: 15, consumos: [{ fecha: '2024-01-01', producto: 'Almuerzo', cantidad: 1, valor: 15 }] }
          ])  
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConvenios) });
    });

    await renderComponent();

    const btnReporte = await screen.findByText('Generar Reporte');
    fireEvent.click(btnReporte);

    await waitFor(() => expect(screen.getByText(/Reporte de Consumos - Empresa A/i)).toBeInTheDocument());

    const btnGenerar = screen.getByRole('button', { name: 'Generar Reporte' });
    
    await act(async () => {
      fireEvent.click(btnGenerar);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Consumo Mensual')).toBeInTheDocument();
      expect(screen.getByText('Juan')).toBeInTheDocument();
    });
  });
});
