import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ProductManager } from './ProductManager';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

describe('ProductManager', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as ReturnType<typeof vi.fn>).mockReturnValue({ toast: mockToast });
    window.confirm = vi.fn(() => true);
  });

  const mockCategories = [
    { id_categoria_menu: 1, nombre_categoria: 'Entradas' },
    { id_categoria_menu: 2, nombre_categoria: 'Sopas' },
  ];

  const mockProducts = [
    { id: 10, nombre: 'Sopa de Verduras', id_categoria: 2 },
    { id: 11, nombre: 'Ensalada César', id_categoria: 1 },
  ];

  it('se renderiza correctamente y carga categorias y platos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/alimentos/categorias') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        });
      }
      if (url === '/alimentos') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProducts),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<ProductManager onProductsChanged={vi.fn()} />);

    const triggerBtn = screen.getByRole('button', { name: /Gestionar Platos/i });
    expect(triggerBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    expect(apiFetch).toHaveBeenCalledWith('/alimentos/categorias');
    expect(apiFetch).toHaveBeenCalledWith('/alimentos');
    expect(screen.getByText('Gestionar Platos / Alimentos')).toBeInTheDocument();

    // Default category Entradas (id_categoria_menu: 1) should be selected, so it should show Ensalada César
    expect(await screen.findByText('Ensalada César')).toBeInTheDocument();
    expect(screen.queryByText('Sopa de Verduras')).not.toBeInTheDocument();
  });

  it('permite cambiar de categoria para ver otros platos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/alimentos/categorias') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) });
      }
      if (url === '/alimentos') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProducts) });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<ProductManager onProductsChanged={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Platos/i }));
    });

    expect(await screen.findByText('Ensalada César')).toBeInTheDocument();

    const categorySopasBtn = screen.getByRole('button', { name: 'Sopas' });
    await act(async () => {
      fireEvent.click(categorySopasBtn);
    });

    expect(screen.getByText('Sopa de Verduras')).toBeInTheDocument();
    expect(screen.queryByText('Ensalada César')).not.toBeInTheDocument();
  });

  it('permite agregar un nuevo plato', async () => {
    let callCount = 0;
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: { method?: string }) => {
      if (url === '/alimentos/categorias') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) });
      }
      if (url === '/alimentos' && (!options || options.method !== 'POST')) {
        callCount++;
        // On second call (after add), return the new list of products
        const products = callCount > 1 
          ? [...mockProducts, { id: 12, nombre: 'Empanadas', id_categoria: 1 }] 
          : mockProducts;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(products) });
      }
      if (url === '/alimentos' && options && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 12, nombre: 'Empanadas', id_categoria: 1 }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    const onProductsChanged = vi.fn();
    render(<ProductManager onProductsChanged={onProductsChanged} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Platos/i }));
    });

    expect(await screen.findByText('Ensalada César')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Nuevo plato/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Empanadas' } });
    });

    const btnAdd = screen.getByRole('button', { name: /Agregar/i });
    await act(async () => {
      fireEvent.click(btnAdd);
    });

    expect(apiFetch).toHaveBeenCalledWith('/alimentos', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nombre: 'Empanadas', id_categoria: 1 })
    }));

    expect(mockToast).toHaveBeenCalledWith({ title: 'Producto agregado' });
    expect(onProductsChanged).toHaveBeenCalled();
    expect(await screen.findByText('Empanadas')).toBeInTheDocument();
  });

  it('permite eliminar un plato', async () => {
    let callCount = 0;
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: { method?: string }) => {
      if (url === '/alimentos/categorias') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) });
      }
      if (url === '/alimentos' && (!options || options.method !== 'DELETE')) {
        callCount++;
        const products = callCount > 1 
          ? mockProducts.filter(p => p.id !== 11) // Removed Ensalada Cesar (id 11)
          : mockProducts;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(products) });
      }
      if (url.startsWith('/alimentos/') && options && options.method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    const onProductsChanged = vi.fn();
    render(<ProductManager onProductsChanged={onProductsChanged} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Platos/i }));
    });

    expect(await screen.findByText('Ensalada César')).toBeInTheDocument();

    const productRow = screen.getByText('Ensalada César').closest('div');
    const deleteBtn = productRow?.querySelector('button');
    
    if (!deleteBtn) throw new Error('Delete button not found');

    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith('/alimentos/11', expect.objectContaining({ method: 'DELETE' }));
    expect(mockToast).toHaveBeenCalledWith({ title: 'Producto eliminado' });
    expect(onProductsChanged).toHaveBeenCalled();
  });
});
