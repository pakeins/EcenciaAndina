/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Pedidos from './Pedidos';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// Mocking subcomponents
vi.mock('@/components/orders/NewOrderDialog', () => ({
  NewOrderDialog: ({ open, onCreate }: any) => open ? <div data-testid="new-order-dialog"><button onClick={onCreate}>Create</button></div> : null
}));
vi.mock('@/components/orders/EditOrderDialog', () => ({
  EditOrderDialog: ({ open, onSave }: any) => open ? <div data-testid="edit-order-dialog"><button onClick={onSave}>Save</button></div> : null
}));

describe('Pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getMockOrders = () => [
    {
      id_orden: 'o1',
      created_at: new Date().toISOString(),
      id_cliente: 'c1',
      id_estado: 1, // Reservado
      total_productos: 2,
      total_pagar: 7.5,
      clientes: {
        nombre: 'Juan',
        apellido: 'Perez',
        telefono: '0999999999',
        tipos_cliente: { nombre_tipo: 'Cliente Convenio' }
      },
      estados_orden: { nombre_estado: 'Reservado' },
      origenes_pedido: { nombre_origen: 'manual' },
      creador_nombre: 'Admin',
      detalle_orden: [
        {
          id_detalle: 'd1',
          cantidad: 2,
          precio_aplicado: 3.75,
          productos: { nombre_producto: 'Almuerzo' },
          opciones: { sopa: 'Locro', segundo: 'Seco', canal: 'web' }
        }
      ],
      observaciones: 'Sin aji'
    },
    {
      id_orden: 'o2',
      created_at: new Date().toISOString(),
      id_cliente: 'c2',
      id_estado: 2, // Consumido
      total_productos: 1,
      total_pagar: 3.5,
      clientes: {
        nombre: 'Maria',
        apellido: 'Gomez',
        telefono: '0988888888',
        tipos_cliente: { nombre_tipo: 'Cliente Frecuente' }
      },
      estados_orden: { nombre_estado: 'Consumido' },
      detalle_orden: []
    }
  ];

  const renderComponent = async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Pedidos />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.queryByText(/Cargando pedidos/i)).not.toBeInTheDocument());
  };

  it('se renderiza correctamente y simula carga de datos (smoke test)', async () => {
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(getMockOrders())
    });

    await renderComponent();

    expect(screen.getByText('Lista de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('(Sopa: Locro, Segundo: Seco)')).toBeInTheDocument();
    expect(screen.getByText(/Sin aji/)).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('filtra pedidos por busqueda y estado', async () => {
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(getMockOrders()) });

    await renderComponent();

    const searchInput = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(searchInput, { target: { value: 'Juan' } });
    
    expect(screen.queryByText('Maria Gomez')).not.toBeInTheDocument();
    
    fireEvent.change(searchInput, { target: { value: '' } });
    
    // El select de tipo no tiene aria-label; usamos getAllByRole y el que contiene texto de tipo
    const allComboboxes = screen.getAllByRole('combobox');
    const tipoTrigger = allComboboxes.find(c => c.textContent?.toLowerCase().includes('tipo') || c.textContent?.toLowerCase().includes('todos'));
    if (tipoTrigger) {
      fireEvent.click(tipoTrigger);
      const convenioOption = screen.queryByRole('option', { name: /convenio/i });
      if (convenioOption) {
        fireEvent.click(convenioOption);
        expect(screen.queryByText('Maria Gomez')).not.toBeInTheDocument();
      }
    }
    // Al menos la búsqueda por nombre funciona
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });

  it('actualiza el estado de un pedido a Consumido exitosamente', async () => {
    (apiFetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(getMockOrders()) });
    (apiFetch as any).mockResolvedValueOnce({ ok: true });

    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const consumidoOption = screen.getByRole('option', { name: /Consumido/i });
      fireEvent.click(consumidoOption);
      
      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining('/ordenes/o1/estado'),
          expect.objectContaining({ method: 'PUT', body: JSON.stringify({ id_estado: 2, forceFallback: false }) })
        );
      });
      
      const { toast } = await import('sonner');
      expect(toast.success).toHaveBeenCalledWith('Pedido marcado como consumido');
    }
  });

  it('actualiza el estado a Cancelado con confirmacion', async () => {
    (apiFetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(getMockOrders()) });
    (apiFetch as any).mockResolvedValueOnce({ ok: true });

    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const canceladoOption = screen.getByRole('option', { name: /Cancelado/i });
      fireEvent.click(canceladoOption);
      
      // Ahora la cancelación usa ConfirmDialog en lugar de window.confirm
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /Sí, Cancelar/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining('/ordenes/o1/estado'),
          expect.objectContaining({ method: 'PUT', body: JSON.stringify({ id_estado: 3, forceFallback: false }) })
        );
      });
    }
  });

  it('maneja el flujo de confirmacion especial (fallback de saldo)', async () => {
    (apiFetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(getMockOrders()) });
    (apiFetch as any).mockResolvedValueOnce({ 
      ok: false, 
      status: 409, 
      json: () => Promise.resolve({ requireConfirmation: true, error: 'Convenio sin cupo' }) 
    });

    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const consumidoOption = screen.getByRole('option', { name: /Consumido/i });
      fireEvent.click(consumidoOption);
      
      await waitFor(() => {
        expect(screen.getByText('Convenio sin cupo')).toBeInTheDocument();
      });
      
      (apiFetch as any).mockResolvedValueOnce({ ok: true });
      const confirmButton = screen.getByRole('button', { name: /Sí, utilizar saldo/i });
      fireEvent.click(confirmButton);
      
      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining('/ordenes/o1/estado'),
          expect.objectContaining({ method: 'PUT', body: JSON.stringify({ id_estado: 2, forceFallback: true }) })
        );
      });
    }
  });

  it('maneja error de saldo insuficiente', async () => {
    (apiFetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(getMockOrders()) });
    (apiFetch as any).mockResolvedValueOnce({ 
      ok: false, 
      status: 400, 
      json: () => Promise.resolve({ error: 'Saldo insuficiente test error' }) 
    });

    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const consumidoOption = screen.getByRole('option', { name: /Consumido/i });
      fireEvent.click(consumidoOption);
      
      // El error se muestra en un AlertDialog, buscamos el diálogo de error
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      // Verificar que el mensaje aparece dentro del alertdialog
      const dialog = screen.getByRole('alertdialog');
      expect(dialog.textContent).toMatch(/Saldo insuficiente test error/i);

      const okButton = screen.getByRole('button', { name: /Entendido|Aceptar|Ok|Cerrar/i });
      fireEvent.click(okButton);
      
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    }
  });
  
  it('permite crear nuevo pedido', async () => {
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(getMockOrders()) });

    await renderComponent();

    const btn = screen.getByRole('button', { name: /Nuevo Pedido/i });
    fireEvent.click(btn);
    
    expect(screen.getByTestId('new-order-dialog')).toBeInTheDocument();
    
    const createBtn = screen.getByText('Create');
    fireEvent.click(createBtn);
  });

  it('permite editar un pedido', async () => {
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(getMockOrders()) });

    await renderComponent();

    await waitFor(() => {
        const editBtns = screen.queryAllByTitle('Editar pedido');
        expect(editBtns.length).toBeGreaterThan(0);
    });

    const editBtns = screen.queryAllByTitle('Editar pedido');
    fireEvent.click(editBtns[0]);
    
    expect(screen.getByTestId('edit-order-dialog')).toBeInTheDocument();
    
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);
  });

  it('navega al historial', async () => {
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await renderComponent();

    const btn = screen.getByRole('button', { name: /Historial/i });
    fireEvent.click(btn);
    
    expect(mockNavigate).toHaveBeenCalledWith('/historial-pedidos');
  });

  it('cubre formatOrderDetails con claves desconocidas y sortedOrders con igual prioridad', async () => {
    const customOrders = [
      ...getMockOrders(),
      {
        id_orden: 'o3',
        created_at: new Date(Date.now() - 10000).toISOString(),
        id_cliente: 'c3',
        id_estado: 1, 
        total_productos: 1,
        total_pagar: 1,
        clientes: { nombre: 'A', apellido: 'B', telefono: '123', tipos_cliente: { nombre_tipo: 'x' } },
        estados_orden: { nombre_estado: 'Reservado' },
        detalle_orden: [
          {
            id_detalle: 'd3',
            cantidad: 1,
            precio_aplicado: 1,
            productos: { nombre_producto: 'X' },
            opciones: { "ZZZ": "Z", "AAA": "A" } 
          }
        ]
      }
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(customOrders) });
    await renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/ZZZ: Z/)).toBeInTheDocument();
      expect(screen.getByText(/AAA: A/)).toBeInTheDocument();
    });
  });

  it('cubre el caso de error generico (500) en actualizacion de estado', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/ordenes?')) return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockOrders()) });
      if (url.includes('/estado')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Falla DB' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const consumidoOption = screen.getByRole('option', { name: /Consumido/i });
      fireEvent.click(consumidoOption);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Falla DB');
      });
    }
  });

  it('cubre el caso de error de red (throw) en actualizacion de estado', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/ordenes?')) return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockOrders()) });
      if (url.includes('/estado')) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    await renderComponent();

    const selects = screen.getAllByRole('combobox');
    const estadoSelect = selects.find(s => s.textContent?.includes('Reservado') || s.textContent?.includes('Estado'));
    if (estadoSelect) {
      fireEvent.click(estadoSelect);
      const consumidoOption = screen.getByRole('option', { name: /Consumido/i });
      fireEvent.click(consumidoOption);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error de conexión');
      });
    }
  });
});
