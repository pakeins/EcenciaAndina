import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { OrderFormFields, OrderFormState } from './OrderFormFields';
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
      if (url.endsWith('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 10, nombre_categoria: 'Sopa' },
            { id_categoria_menu: 11, nombre_categoria: 'Segundo' }
          ])
        });
      }
      if (url.endsWith('/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria: 1, nombre_categoria: 'Almuerzos' },
            { id_categoria: 2, nombre_categoria: 'Bebidas' }
          ])
        });
      }
      if (url.endsWith('/productos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'p1', nombre: 'Ejecutivo Completo', precio: 3.5, id_categoria: 1, categoria_nombre: 'Almuerzos' },
            { id: 'p2', nombre: 'Jugo de Mora', precio: 1.0, id_categoria: 2, categoria_nombre: 'Bebidas' }
          ])
        });
      }
      if (url.endsWith('/menu')) {
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

  it('permite añadir observaciones', async () => {
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

    const increaseBtn = screen.getAllByTestId('icon-plus')[1].parentElement;
    if (increaseBtn) {
      fireEvent.click(increaseBtn);
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

  it('maneja seleccion de almuerzo y muestra opciones de menu', async () => {
    await renderComponent();

    // Select the Almuerzo dropdown
    const selectAlmuerzo = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(selectAlmuerzo);
    });

    const optionAlmuerzo = await screen.findByText('Ejecutivo Completo');
    await act(async () => {
      fireEvent.click(optionAlmuerzo);
    });

    // Check that option lists (Sopa, Segundo) are loaded
    expect(screen.getByText('¿Qué sopa desea?')).toBeInTheDocument();
    expect(screen.getByText('¿Qué segundo desea?')).toBeInTheDocument();
  });

  it('muestra error al agregar si falta seleccionar producto u opciones obligatorias', async () => {
    await renderComponent();

    const addBtn = screen.getByRole('button', { name: /Agregar Producto/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(toast.error).toHaveBeenCalledWith('Seleccione un producto');

    // Now select product but don't fill options
    const selectAlmuerzo = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(selectAlmuerzo);
    });

    const optionAlmuerzo = await screen.findByText('Ejecutivo Completo');
    await act(async () => {
      fireEvent.click(optionAlmuerzo);
    });

    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(toast.error).toHaveBeenCalledWith('Por favor especifique: Sopa');
  });

  it('cambia el modo del formulario a adicionales (extra) cuando se hace clic en el boton correspondiente', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { id_producto: 'p1', nombre: 'Ejecutivo Completo', precio: 3.5, cantidad: 1, id_categoria: 1 }
      ]
    };
    await renderComponent({ state: stateWithItem });

    const btnExtra = screen.getByRole('button', { name: /🥤 Añadir adicionales/i });
    await act(async () => {
      fireEvent.click(btnExtra);
    });

    // Verificamos que ahora aparezca la etiqueta Categoría
    expect(screen.getByText('Categoría')).toBeInTheDocument();
  });

  it('valida el saldo del monedero (availableBalances) si es provisto', async () => {
    const balances = {
      'p1': 1
    };
    await renderComponent({ availableBalances: balances });

    // Select the Almuerzo dropdown
    const selectAlmuerzo = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(selectAlmuerzo);
    });

    const optionAlmuerzo = await screen.findByText('Ejecutivo Completo');
    await act(async () => {
      fireEvent.click(optionAlmuerzo);
    });

    // Cambiar cantidad a 2 (el monedero solo tiene 1 disponible)
    const increaseBtn = screen.getAllByTestId('icon-plus')[1].parentElement;
    if (increaseBtn) {
      await act(async () => {
        fireEvent.click(increaseBtn);
      });
    }

    // Llenamos las opciones necesarias
    const selects = screen.getAllByRole('combobox');
    // Select Sopa
    await act(async () => {
      fireEvent.click(selects[1]);
    });
    const optionSopa = await screen.findByText('Locro de papa');
    await act(async () => {
      fireEvent.click(optionSopa);
    });

    // Select Segundo
    await act(async () => {
      fireEvent.click(selects[2]);
    });
    const optionSegundo = await screen.findByText('Pollo al horno');
    await act(async () => {
      fireEvent.click(optionSegundo);
    });

    const addBtn = screen.getByRole('button', { name: /Agregar Producto/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(toast.error).toHaveBeenCalledWith('Solo tiene 1 disponibles en su monedero para este producto');
  });

  it('permite cambiar a opcion personalizada "Otra opción..." y escribir una entrada manual', async () => {
    await renderComponent();

    const selectAlmuerzo = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(selectAlmuerzo);
    });

    const optionAlmuerzo = await screen.findByText('Ejecutivo Completo');
    await act(async () => {
      fireEvent.click(optionAlmuerzo);
    });

    // Elegir "Otra opción..." en el select de Sopa
    const selects = screen.getAllByRole('combobox');
    await act(async () => {
      fireEvent.click(selects[1]);
    });

    const optionCustom = await screen.findByText('Otra opción...');
    await act(async () => {
      fireEvent.click(optionCustom);
    });

    // Debe renderizarse un input para escribir la opción manualmente
    const customInput = screen.getByPlaceholderText('Escriba su sopa');
    expect(customInput).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(customInput, { target: { value: 'Sopa de Cebolla' } });
    });

    expect(customInput).toHaveValue('Sopa de Cebolla');

    // Cambiar a ver menú de nuevo si se hace clic
    const btnVerMenu = screen.getByRole('button', { name: 'Ver menú' });
    await act(async () => {
      fireEvent.click(btnVerMenu);
    });

    // El input manual ya no debería estar
    expect(screen.queryByPlaceholderText('Escriba su sopa')).not.toBeInTheDocument();
  });

  it('muestra items en el carrito cuando hay items con opciones', async () => {
    const stateWithItem = {
      observaciones: '',
      items: [
        { id_producto: 'p1', nombre: 'Ejecutivo Completo', precio: 3.5, cantidad: 2, id_categoria: 1, opciones: { 'Sopa': 'Locro de papa' } }
      ]
    };
    await renderComponent({ state: stateWithItem });
    await waitFor(() => {
      expect(screen.getByText('Ejecutivo Completo')).toBeInTheDocument();
      expect(screen.getByText('Sopa: Locro de papa')).toBeInTheDocument();
    });
  });

  it('permite decrementar la cantidad del formulario', async () => {
    await renderComponent();
    
    // Primero incrementamos
    const increaseBtn = screen.getAllByTestId('icon-plus')[1].parentElement;
    if (increaseBtn) {
      fireEvent.click(increaseBtn);
      expect(screen.getByText('2')).toBeInTheDocument();
    }

    // Luego decrementamos
    const decreaseBtn = screen.getByTestId('icon-minus').parentElement;
    if (decreaseBtn) {
      fireEvent.click(decreaseBtn);
      expect(screen.getByText('1')).toBeInTheDocument();
    }
  });

  it('filtra opciones de menu para otros tipos de almuerzo', async () => {
    // Mock general pero con otros platos
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.endsWith('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 10, nombre_categoria: 'Sopa' },
            { id_categoria_menu: 11, nombre_categoria: 'Segundo' },
            { id_categoria_menu: 12, nombre_categoria: 'Entrada' }
          ])
        });
      }
      if (url.endsWith('/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id_categoria: 1, nombre_categoria: 'Almuerzos' }])
        });
      }
      if (url.endsWith('/productos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'p1', nombre: 'Ejecutivo Sin Sopa', precio: 3.0, id_categoria: 1, categoria_nombre: 'Almuerzos' },
            { id: 'p2', nombre: 'Almuerzo del Dia', precio: 2.5, id_categoria: 1, categoria_nombre: 'Almuerzos' }
          ])
        });
      }
      if (url.endsWith('/menu')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{
            estado: 'activo',
            opciones: {
              '10': ['Locro'],
              '11': ['Pollo'],
              '12': ['Ensalada']
            }
          }])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();

    // Seleccionamos Ejecutivo Sin Sopa
    const selectAlmuerzo = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(selectAlmuerzo);
    });

    const optionSinSopa = await screen.findByText('Ejecutivo Sin Sopa');
    await act(async () => {
      fireEvent.click(optionSinSopa);
    });

    // Para "Ejecutivo Sin Sopa", no debe mostrar Sopa
    expect(screen.queryByText('¿Qué sopa desea?')).not.toBeInTheDocument();
    expect(screen.getByText('¿Qué segundo desea?')).toBeInTheDocument();
    expect(screen.getByText('¿Qué entrada desea?')).toBeInTheDocument();
  });
});

