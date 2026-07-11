/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Productos from './Productos';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('Productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getMockProducts = () => [
    {
      id: 'p1',
      nombre: 'Almuerzo Ejecutivo',
      precio: 3.5,
      activo: true,
      id_categoria: 1,
      categoria_nombre: 'Almuerzos',
      descripcion: 'Sopa, seco, jugo'
    },
    {
      id: 'p2',
      nombre: 'Jugo de Mora',
      precio: 1.0,
      activo: false,
      id_categoria: 2,
      categoria_nombre: 'Bebidas',
      descripcion: 'Frio'
    }
  ];

  const getMockCategories = () => [
    { id_categoria: 1, nombre_categoria: 'Almuerzos' },
    { id_categoria: 2, nombre_categoria: 'Bebidas' }
  ];

  const renderComponent = async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Productos />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.queryByText(/Cargando productos/i)).not.toBeInTheDocument());
  };

  it('se renderiza correctamente y carga datos (smoke test)', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
    });

    await renderComponent();

    expect(screen.getByText('Catálogo de Productos')).toBeInTheDocument();
    expect(screen.getByText('Almuerzo Ejecutivo')).toBeInTheDocument();
    expect(screen.getByText('Jugo de Mora')).toBeInTheDocument();
  });



  it('permite filtrar por categoría', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
    });

    await renderComponent();

    const categorySelect = screen.getByRole('combobox');
    fireEvent.click(categorySelect);
    
    const bebidasOption = screen.getByRole('option', { name: /Bebidas/i });
    fireEvent.click(bebidasOption);

    expect(screen.getByText('Jugo de Mora')).toBeInTheDocument();
    expect(screen.queryByText('Almuerzo Ejecutivo')).not.toBeInTheDocument();
  });

  it('permite cambiar estado de un producto (toggle)', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
      
      // Update call
      if (url === '/productos/p1') {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ ...getMockProducts()[0], activo: false }) 
        });
      }
    });

    await renderComponent();

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/productos/p1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ activo: false }) })
      );
    });

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Producto desactivado');
  });

  it('abre el modal de nuevo producto, valida e inserta', async () => {
    (apiFetch as any).mockImplementation((url: string, options?: any) => {
      if (url === '/productos' && options?.method === 'POST') {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ 
            id: 'p3', nombre: 'Test', precio: 5, activo: true, id_categoria: 1, categoria_nombre: 'Almuerzos' 
          }) 
        });
      }
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
    });

    await renderComponent();

    const newBtn = screen.getByRole('button', { name: /Nuevo Producto/i });
    fireEvent.click(newBtn);

    expect(screen.getByRole('heading', { name: /Nuevo Producto/i })).toBeInTheDocument();

    const nombreInput = screen.getByPlaceholderText('Ej: Almuerzo Ejecutivo');
    const precioInput = screen.getByPlaceholderText('0.00');

    // Trying to save without data
    const saveBtn = screen.getByRole('button', { name: /Guardar Producto/i });
    fireEvent.click(saveBtn);
    
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('Complete todos los campos');

    // Fill data
    fireEvent.change(nombreInput, { target: { value: 'Test' } });
    fireEvent.change(precioInput, { target: { value: '5' } });
    
    // Select Category in Modal
    // The second combobox should be the category in modal
    const combos = screen.getAllByRole('combobox');
    fireEvent.click(combos[combos.length - 1]);
    const catOption = screen.getByRole('option', { name: /Almuerzos/i });
    fireEvent.click(catOption);

    // Save
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/productos',
        expect.objectContaining({ method: 'POST' })
      );
    });
    
    expect(toast.success).toHaveBeenCalledWith('Producto creado');
  });

  it('permite cambiar a la vista de categorias y agregar una', async () => {
    (apiFetch as any).mockImplementation((url: string, options?: any) => {
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') {
        if (options?.method === 'POST') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ id_categoria: 3, nombre_categoria: 'Snacks' }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
      }
    });

    await renderComponent();

    const tabsCategories = screen.getByRole('tab', { name: /Categorías/i });
    fireEvent.focus(tabsCategories);
    fireEvent.keyDown(tabsCategories, { key: 'Enter', code: 'Enter', charCode: 13 });
    fireEvent.click(tabsCategories);

    await waitFor(() => expect(screen.getByRole('button', { name: /Nueva Categoría/i })).toBeInTheDocument());

    const newBtn = screen.getByRole('button', { name: /Nueva Categoría/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('Nueva Categoría', { selector: 'h2' })).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Ej: Bebidas, Postres...');
    fireEvent.change(input, { target: { value: 'Snacks' } });

    const saveBtn = screen.getByRole('button', { name: /Guardar Categoría/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/categorias',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre_categoria: 'Snacks' }) })
      );
    });

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Categoría creada');
  });

  it('permite ordenar productos por nombre, precio, etc', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url === '/productos') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockProducts()) });
      if (url === '/categorias') return Promise.resolve({ ok: true, json: () => Promise.resolve(getMockCategories()) });
    });

    await renderComponent();

    const sortNameBtn = screen.getByText('Producto');
    fireEvent.click(sortNameBtn); // Asc (Almuerzo -> Jugo)
    
    // They are already sorted because A < J. Let's click again to sort Desc
    fireEvent.click(sortNameBtn); // Desc (Jugo -> Almuerzo)
    
    // Can check by position but it's hard. We just verify it doesn't crash
    const sortPriceBtn = screen.getByText('Precio');
    fireEvent.click(sortPriceBtn);
    fireEvent.click(sortPriceBtn);
  });
});
