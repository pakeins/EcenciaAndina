import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { CategoryManager } from './CategoryManager';
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

describe('CategoryManager', () => {
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

  it('renderiza correctamente el boton y carga categorias al abrir', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCategories)
    });

    render(<CategoryManager onCategoriesChanged={vi.fn()} />);
    
    const triggerBtn = screen.getByRole('button', { name: /Gestionar Categorías/i });
    expect(triggerBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    expect(apiFetch).toHaveBeenCalledWith('/alimentos/categorias');
    expect(screen.getByText('Gestionar Categorías de Menú')).toBeInTheDocument();
    expect(await screen.findByText('Entradas')).toBeInTheDocument();
    expect(screen.getByText('Sopas')).toBeInTheDocument();
  });

  it('permite agregar una nueva categoria', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories)
      }) // fetchCategories 1
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id_categoria_menu: 3, nombre_categoria: 'Postres' })
      }) // POST
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([...mockCategories, { id_categoria_menu: 3, nombre_categoria: 'Postres' }])
      }); // fetchCategories 2

    const onCategoriesChanged = vi.fn();

    render(<CategoryManager onCategoriesChanged={onCategoriesChanged} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Categorías/i }));
    });

    const input = screen.getByPlaceholderText(/Nueva categoría/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Postres' } });
    });

    const btnAdd = screen.getByRole('button', { name: /Agregar/i });
    await act(async () => {
      fireEvent.click(btnAdd);
    });

    expect(apiFetch).toHaveBeenCalledWith('/alimentos/categorias', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nombre_categoria: 'Postres' })
    }));

    expect(mockToast).toHaveBeenCalledWith({ title: 'Categoría agregada' });
    expect(onCategoriesChanged).toHaveBeenCalled();
  });

  it('muestra error si falla el guardado de una nueva categoria', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories)
      }) // fetchCategories
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Fallo al guardar' })
      }); // POST

    render(<CategoryManager onCategoriesChanged={vi.fn()} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Categorías/i }));
    });

    const input = screen.getByPlaceholderText(/Nueva categoría/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Postres' } });
    });

    const btnAdd = screen.getByRole('button', { name: /Agregar/i });
    await act(async () => {
      fireEvent.click(btnAdd);
    });

    expect(mockToast).toHaveBeenCalledWith({ variant: 'destructive', title: 'Error', description: 'Fallo al guardar' });
  });

  it('valida categorias duplicadas', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCategories)
    });

    render(<CategoryManager onCategoriesChanged={vi.fn()} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Categorías/i }));
    });

    const input = screen.getByPlaceholderText(/Nueva categoría/i);
    await act(async () => {
      // "entradas" con otra capitalización y espacios
      fireEvent.change(input, { target: { value: ' Entradas ' } });
    });

    const btnAdd = screen.getByRole('button', { name: /Agregar/i });
    await act(async () => {
      fireEvent.click(btnAdd);
    });

    expect(mockToast).toHaveBeenCalledWith({ variant: 'destructive', title: 'Ya existe una categoría con ese nombre' });
    expect(apiFetch).toHaveBeenCalledTimes(1); // Solo el fetch inicial
  });

  it('permite eliminar una categoria', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories)
      }) // fetchCategories 1
      .mockResolvedValueOnce({
        ok: true,
      }) // DELETE
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockCategories[1]])
      }); // fetchCategories 2

    const onCategoriesChanged = vi.fn();

    render(<CategoryManager onCategoriesChanged={onCategoriesChanged} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Categorías/i }));
    });

    // Wait for categories to render
    const btnDeleteEntradas = await screen.findAllByRole('button');
    // Find the trash button for "Entradas"
    // It's the 3rd button (Gestionar, Agregar, Trash1, Trash2)
    // We can use within if we had a data-testid, but let's query all buttons with class text-destructive
    
    await act(async () => {
      fireEvent.click(btnDeleteEntradas[2]); // Third button is the first trash icon
    });

    // El componente ahora usa ConfirmDialog en vez de window.confirm
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Sí, Eliminar/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/\/alimentos\/categorias\/\d+/), expect.objectContaining({ method: 'DELETE' }));
    expect(mockToast).toHaveBeenCalledWith({ title: 'Categoría eliminada' });
    expect(onCategoriesChanged).toHaveBeenCalled();
  });

  it('muestra error si falla la eliminacion de una categoria', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories)
      }) // fetchCategories 1
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Fallo al eliminar' })
      }); // DELETE

    render(<CategoryManager onCategoriesChanged={vi.fn()} />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Gestionar Categorías/i }));
    });

    const btnDeleteEntradas = await screen.findAllByRole('button');
    
    await act(async () => {
      fireEvent.click(btnDeleteEntradas[2]);
    });

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Sí, Eliminar/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockToast).toHaveBeenCalledWith({ variant: 'destructive', title: 'Error', description: 'Fallo al eliminar' });
  });
});
