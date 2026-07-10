import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { OrderFormFields, OrderFormState } from './OrderFormFields';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    Plus: mockComponent('plus'),
    Minus: mockComponent('minus'),
    Trash2: mockComponent('trash'),
    ShoppingCart: mockComponent('shopping-cart'),
    Utensils: mockComponent('utensils'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
    Check: mockComponent('check'),
  };
});

describe('OrderFormFields', () => {
  const mockOnChange = vi.fn();
  const initialState: OrderFormState = {
    items: [],
    observaciones: ''
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria: 1, nombre_categoria: 'Almuerzos' },
            { id_categoria: 2, nombre_categoria: 'Bebidas' }
          ])
        });
      }
      if (url.includes('/productos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'p1', nombre: 'Ejecutivo Completo', precio: 3.5, id_categoria: 1, categoria_nombre: 'Almuerzos' },
            { id: 'p2', nombre: 'Jugo de Mora', precio: 1.0, id_categoria: 2, categoria_nombre: 'Bebidas' }
          ])
        });
      }
      if (url.includes('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 10, nombre_categoria: 'Sopa' },
            { id_categoria_menu: 11, nombre_categoria: 'Segundo' }
          ])
        });
      }
      if (url.includes('/menu')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{
            estado: 'activo',
            opciones: {
              '10': ['Locro de papa', 'Sopa de fideos'],
              '11': ['Pollo al horno', 'Seco de carne']
            }
          }])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  const renderComponent = async (props = {}) => {
    let view;
    await act(async () => {
      view = render(
        <OrderFormFields 
          state={initialState}
          onChange={mockOnChange}
          {...props}
        />
      );
    });
    return view;
  };

  it('se renderiza y carga productos y categorias', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Agregar Almuerzo/i)).toBeInTheDocument();
    });
  });

  it('permite anadir observaciones', async () => {
    await renderComponent();
    
    const textarea = screen.getByPlaceholderText(/Sin cebolla/i);
    fireEvent.change(textarea, { target: { value: 'Nueva observacion' } });

    expect(mockOnChange).toHaveBeenCalledWith({
      items: [],
      observaciones: 'Nueva observacion'
    });
  });

  it('muestra items en el carrito cuando hay items', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { id_producto: 'p1', nombre: 'Ejecutivo Completo', precio: 3.5, cantidad: 2, id_categoria: 1 }
      ]
    };
    await renderComponent({ state: stateWithItem });

    await waitFor(() => {
      expect(screen.getByText('Ejecutivo Completo')).toBeInTheDocument();
      expect(screen.getByText('2x')).toBeInTheDocument();
    });
  });

  it('permite actualizar cantidad del formulario', async () => {
    await renderComponent();

    const initialQuantity = screen.getByText('1');
    expect(initialQuantity).toBeInTheDocument();

    // El primer icon-plus es la cabecera, el segundo es el botón de incrementar
    const increaseBtn = screen.getAllByTestId('icon-plus')[1].parentElement;
    if (increaseBtn) {
      fireEvent.click(increaseBtn);
      // La cantidad debe cambiar a 2
      expect(screen.getByText('2')).toBeInTheDocument();
    }
  });

  it('permite eliminar un item existente', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { id_producto: 'p2', nombre: 'Jugo de Mora', precio: 1, cantidad: 1, id_categoria: 2 }
      ]
    };

    await renderComponent({ state: stateWithItem });

    await waitFor(() => {
      expect(screen.getByTestId('icon-trash')).toBeInTheDocument();
    });

    const removeBtn = screen.getByTestId('icon-trash').parentElement;
    if (removeBtn) {
      fireEvent.click(removeBtn);
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({
        items: []
      }));
    }
  });
});
