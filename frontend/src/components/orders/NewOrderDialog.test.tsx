import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewOrderDialog } from './NewOrderDialog';
import * as useClientsAndConvenios from '@/hooks/useClientsAndConvenios';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/hooks/useClientsAndConvenios');

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

// Mock Select component to render standard HTML select options without nested divs
vi.mock('@/components/ui/select', () => {
  return {
    Select: ({ children, value, onValueChange }: any) => (
      <select value={value} onChange={(e) => onValueChange(e.target.value)} data-testid="mock-select">
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  };
});

// Mock OrderFormFields to isolate testing and easily mock order item states
vi.mock('./OrderFormFields', () => {
  return {
    OrderFormFields: ({ state, onChange }: any) => (
      <div>
        <button 
          type="button" 
          onClick={() => onChange({
            ...state,
            items: [{ id_producto: 10, precio: 5.5, cantidad: 2, opciones: { salsa: 'mayonesa' } }]
          })}
          data-testid="simulate-add-item-btn"
        >
          Mock Add Item
        </button>
      </div>
    )
  };
});

const queryClient = new QueryClient();

describe('NewOrderDialog', () => {
  const mockClients = [
    { id: 'cli-prepago', nombre: 'Juan', apellido: 'Perez', telefono: '0999999999', activo: true, id_tipo_cliente: 2, convenio: null },
    { id: 'cli-convenio', nombre: 'Maria', apellido: 'Gomez', telefono: '0888888888', activo: true, id_tipo_cliente: 3, convenio: { id: 'conv-1' } }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useClientsAndConvenios, 'useClientsAndConvenios').mockReturnValue({
      clientes: mockClients,
      convenios: [],
      isLoading: false,
      refetchClients: vi.fn(),
    });
  });

  const renderComponent = (props: Partial<Parameters<typeof NewOrderDialog>[0]> = {}) => {
    const mergedProps = {
      open: true,
      onOpenChange: vi.fn(),
      onCreate: vi.fn(),
      ...props
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NewOrderDialog {...mergedProps} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('se renderiza correctamente con mensaje para seleccionar cliente', () => {
    renderComponent();
    expect(screen.getByText('Nuevo Pedido')).toBeInTheDocument();
    expect(screen.getByText('Seleccione un cliente para continuar con el pedido.')).toBeInTheDocument();
  });

  it('cierra el dialogo al presionar Cancelar', () => {
    const onOpenChange = vi.fn();
    renderComponent({ onOpenChange });

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('muestra error al guardar una orden sin productos', async () => {
    renderComponent();

    // Select a client using mock-select
    const select = screen.getByTestId('mock-select');
    fireEvent.change(select, { target: { value: 'cli-prepago' } });

    // Submit form (without items added)
    const submitBtn = screen.getByRole('button', { name: /Crear Pedido/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Agregue al menos un producto al pedido');
    });
  });

  it('crea un pedido de saldo prepago exitosamente', async () => {
    const onCreate = vi.fn();
    const onOpenChange = vi.fn();
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    renderComponent({ onCreate, onOpenChange });

    // Select cli-prepago client
    const select = screen.getByTestId('mock-select');
    fireEvent.change(select, { target: { value: 'cli-prepago' } });

    // Click mock add item button to populate order items
    const addItemBtn = screen.getByTestId('simulate-add-item-btn');
    fireEvent.click(addItemBtn);

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Crear Pedido/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id_cliente: 'cli-prepago',
          id_estado: 1,
          id_origen: 2,
          canal_origen: 'Sistema',
          metodo_pago: 'Saldo Prepago',
          observaciones: '',
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
      expect(toast.success).toHaveBeenCalledWith('Pedido registrado exitosamente en la base de datos');
      expect(onCreate).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('crea un pedido de convenio empresa exitosamente', async () => {
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    renderComponent();

    // Select cli-convenio client
    const select = screen.getByTestId('mock-select');
    fireEvent.change(select, { target: { value: 'cli-convenio' } });

    // Click mock add item button
    const addItemBtn = screen.getByTestId('simulate-add-item-btn');
    fireEvent.click(addItemBtn);

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Crear Pedido/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"metodo_pago":"Convenio Empresa"')
      }));
    });
  });

  it('maneja error de API al crear pedido', async () => {
    (apiFetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Falta stock del producto' })
    });

    renderComponent();

    const select = screen.getByTestId('mock-select');
    fireEvent.change(select, { target: { value: 'cli-prepago' } });

    const addItemBtn = screen.getByTestId('simulate-add-item-btn');
    fireEvent.click(addItemBtn);

    const submitBtn = screen.getByRole('button', { name: /Crear Pedido/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al guardar: Falta stock del producto');
    });
  });

  it('maneja error de red al crear pedido', async () => {
    (apiFetch as any).mockRejectedValue(new Error('Network error'));

    renderComponent();

    const select = screen.getByTestId('mock-select');
    fireEvent.change(select, { target: { value: 'cli-prepago' } });

    const addItemBtn = screen.getByTestId('simulate-add-item-btn');
    fireEvent.click(addItemBtn);

    const submitBtn = screen.getByRole('button', { name: /Crear Pedido/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error de conexión con el servidor');
    });
  });
});
