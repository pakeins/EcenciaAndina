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

  it('permite agregar un producto estandar', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Jugo de Mora/i)).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    const addButton = buttons.find(b => b.textContent?.includes('Agregar Jugo de Mora'));
    if (addButton) {
      fireEvent.click(addButton);
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ producto_id: 'p2', cantidad: 1 })
        ])
      }));
    }
  });

  it('muestra las opciones de almuerzo al agregar uno', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Agregar Almuerzo/i)).toBeInTheDocument();
    });

    const addLunchBtn = screen.getByText(/Agregar Almuerzo/i);
    fireEvent.click(addLunchBtn);

    // Debe abrir the dialog para elegir sopa y segundo
    await waitFor(() => {
      expect(screen.getByText(/Sopa/i)).toBeInTheDocument();
      expect(screen.getByText(/Segundo/i)).toBeInTheDocument();
      expect(screen.getByText(/Confirmar Almuerzo/i)).toBeInTheDocument();
    });
  });

  it('permite actualizar cantidad de un item existente', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { producto_id: 'p2', nombre: 'Jugo de Mora', precio: 1, cantidad: 1 }
      ]
    };

    await renderComponent({ state: stateWithItem });

    await waitFor(() => {
      expect(screen.getByTestId('icon-plus')).toBeInTheDocument();
    });

    const increaseBtn = screen.getAllByTestId('icon-plus')[0].parentElement;
    if (increaseBtn) {
      fireEvent.click(increaseBtn);
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ producto_id: 'p2', cantidad: 2 })
        ])
      }));
    }
  });

  it('permite eliminar un item existente', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { producto_id: 'p2', nombre: 'Jugo de Mora', precio: 1, cantidad: 1 }
      ]
    };

    await renderComponent({ state: stateWithItem });

    await waitFor(() => {
      expect(screen.getByTestId('icon-trash')).toBeInTheDocument();
    });

    const removeBtn = screen.getAllByTestId('icon-trash')[0].parentElement;
    if (removeBtn) {
      fireEvent.click(removeBtn);
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({
        items: []
      }));
    }
  });
});
