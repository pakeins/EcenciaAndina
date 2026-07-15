import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodSelector } from './FoodSelector';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedToast = vi.mocked(toast);

describe('FoodSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea un plato fuerte usando la categoria recibida y lo propaga', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 8, nombre: 'Seco de pollo', id_categoria: 2 }),
    } as Response);
    const onChange = vi.fn();
    const onFoodCreated = vi.fn();

    render(
      <FoodSelector
        value=""
        onChange={onChange}
        idCategoria={2}
        alimentos={[]}
        onFoodCreated={onFoodCreated}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar plato...'), {
      target: { value: 'Seco de pollo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir "Seco de pollo" al catálogo' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/alimentos', {
        method: 'POST',
        body: JSON.stringify({ id_categoria: 2, nombre: 'Seco de pollo' }),
      });
    });
    expect(onFoodCreated).toHaveBeenCalledWith({
      id: 8,
      nombre: 'Seco de pollo',
      id_categoria: 2,
    });
    expect(onChange).toHaveBeenCalledWith('Seco de pollo');
  });

  it('muestra el error de validacion devuelto por el backend', async () => {
    mockedApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Categoria debe ser mayor a 0.' }),
    } as Response);

    render(
      <FoodSelector
        value=""
        onChange={vi.fn()}
        idCategoria={2}
        alimentos={[]}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar plato...'), {
      target: { value: 'Seco de pollo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir "Seco de pollo" al catálogo' }));

    await waitFor(() => {
      expect(mockedToast.error).toHaveBeenCalledWith('No se pudo guardar el nuevo plato', {
        description: 'Categoria debe ser mayor a 0.',
      });
    });
  });

  it('muestra un error por defecto si la creacion falla de forma inesperada', async () => {
    mockedApiFetch.mockRejectedValue(new Error('Network error'));

    render(
      <FoodSelector
        value=""
        onChange={vi.fn()}
        idCategoria={2}
        alimentos={[]}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar plato...'), {
      target: { value: 'Sancocho' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir "Sancocho" al catálogo' }));

    await waitFor(() => {
      expect(mockedToast.error).toHaveBeenCalledWith('No se pudo guardar el nuevo plato', {
        description: 'Network error',
      });
    });
  });

  it('deshabilita el selector cuando la categoria aun no esta disponible', () => {
    render(
      <FoodSelector
        value=""
        onChange={vi.fn()}
        idCategoria={0}
        alimentos={[]}
      />,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('impide crear un alimento si ya está en la lista de excluidos', () => {
    render(
      <FoodSelector
        value=""
        onChange={vi.fn()}
        idCategoria={2}
        alimentos={[]}
        exclude={['Sopa de Queso']}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar plato...'), {
      target: { value: 'Sopa de queso' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir "Sopa de queso" al catálogo' }));

    expect(mockedToast.error).toHaveBeenCalledWith('"Sopa de queso" ya está seleccionado en otra opción');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('permite seleccionar un alimento existente del catálogo', () => {
    const onChange = vi.fn();
    render(
      <FoodSelector
        value=""
        onChange={onChange}
        idCategoria={2}
        alimentos={[{ id: 10, nombre: 'Arroz con menestra', id_categoria: 2 }]}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Arroz con menestra'));

    expect(onChange).toHaveBeenCalledWith('Arroz con menestra');
    // En radix-ui al seleccionar se cierra el popover automáticamente pero disparamos el onSelect
  });
});
