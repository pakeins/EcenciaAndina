import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditOrderDialog } from './EditOrderDialog';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

const queryClient = new QueryClient();

describe('EditOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default implementations for initialization requests
    (apiFetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/categorias') || url.includes('/productos') || url.includes('/menu') || url.includes('/alimentos/categorias')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });
  });

  const renderComponent = (props: Partial<Parameters<typeof EditOrderDialog>[0]> = {}) => {
    const defaultOrder = {
      id_orden: '1-uuid',
      numero_orden: 123,
      observaciones: 'Sin cebolla',
      clientes: {
        nombre: 'Juan',
        apellido: 'Perez',
        telefono: '0999999999',
        tipos_cliente: {
          nombre_tipo: 'Convenio Empresa'
        }
      },
      detalle_orden: [
        {
          id_producto: 10,
          precio_aplicado: 5.5,
          cantidad: 2,
          opciones: { salsa: 'mayonesa' },
          productos: {
            nombre_producto: 'Hamburguesa'
          }
        }
      ]
    };

    const mergedProps = {
      order: defaultOrder,
      open: true,
      onOpenChange: vi.fn(),
      onSave: vi.fn(),
      ...props
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EditOrderDialog {...mergedProps} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('retorna null si no hay orden', () => {
    const { container } = renderComponent({ order: null });
    expect(container.firstChild).toBeNull();
  });

  it('se renderiza correctamente con los detalles de la orden y el cliente', () => {
    renderComponent();
    expect(screen.getByText('Editar Pedido')).toBeInTheDocument();
    expect(screen.getByText('#123')).toBeInTheDocument();
    // Juan Perez is rendered twice (header and info card), so we get all elements
    const clientElements = screen.getAllByText(/Juan Perez/);
    expect(clientElements.length).toBeGreaterThan(0);
    expect(screen.getByText('0999999999')).toBeInTheDocument();
    expect(screen.getAllByText('Convenio Empresa').length).toBeGreaterThan(0);
  });

  it('cierra el diálogo al presionar Cancelar', () => {
    const onOpenChange = vi.fn();
    renderComponent({ onOpenChange });
    
    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);
    
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('muestra un error si se intenta guardar sin productos', async () => {
    const orderWithNoDetails = {
      id_orden: '2',
      clientes: { nombre: 'Luis', apellido: 'Gomez', tipos_cliente: { nombre_tipo: 'Normal' } },
      detalle_orden: []
    };
    renderComponent({ order: orderWithNoDetails });

    const saveBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveBtn);

    expect(toast.error).toHaveBeenCalledWith('Agregue al menos un producto al pedido');
  });

  it('guarda correctamente la orden y refresca', async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    (apiFetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/categorias') || url.includes('/productos') || url.includes('/menu') || url.includes('/alimentos/categorias')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      if (url.includes('/ordenes/1-uuid')) {
        return { ok: true, json: () => Promise.resolve({ success: true }) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    renderComponent({ onSave, onOpenChange });

    const saveBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/ordenes/1-uuid', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          observaciones: 'Sin cebolla',
          detalles: [
            {
              id_producto: 10,
              cantidad: 2,
              precio_aplicado: 5.5,
              opciones: { salsa: 'mayonesa' }
            }
          ]
        })
      }));
      expect(toast.success).toHaveBeenCalledWith('Pedido actualizado correctamente');
      expect(onSave).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('maneja errores de la API al guardar', async () => {
    (apiFetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/categorias') || url.includes('/productos') || url.includes('/menu') || url.includes('/alimentos/categorias')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      if (url.includes('/ordenes/1-uuid')) {
        return { ok: false, json: () => Promise.resolve({ error: 'Saldo insuficiente' }) };
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    renderComponent();

    const saveBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al guardar: Saldo insuficiente');
    });
  });

  it('maneja errores de conexion de red al guardar', async () => {
    (apiFetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/categorias') || url.includes('/productos') || url.includes('/menu') || url.includes('/alimentos/categorias')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      if (url.includes('/ordenes/1-uuid')) {
        return Promise.reject(new Error('Network error'));
      }
      return { ok: true, json: () => Promise.resolve({}) };
    });

    renderComponent();

    const saveBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error de conexión con el servidor');
    });
  });
});
