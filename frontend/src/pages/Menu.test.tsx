import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import Menu from './Menu';
import { apiFetch } from '@/lib/api';
import { menuStore } from '@/data/menuStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
    Soup: mockComponent('soup'),
    ChefHat: mockComponent('chef-hat'),
    Send: mockComponent('send'),
    CalendarDays: mockComponent('calendar-days'),
    Image: mockComponent('image'),
    Plus: mockComponent('plus'),
    Trash2: mockComponent('trash'),
    Utensils: mockComponent('utensils'),
    Cake: mockComponent('cake'),
    Wine: mockComponent('wine'),
    Cookie: mockComponent('cookie'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
    Check: mockComponent('check'),
    X: mockComponent('x'),
    Search: mockComponent('search'),
    Pencil: mockComponent('pencil'),
    ChevronsUpDown: mockComponent('chevrons-up-down'),
  };
});

vi.mock('@/lib/menuImage', () => ({
  buildTelegramMenuImage: vi.fn(() => 'data:image/png;base64,fake'),
}));

describe('Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 1, nombre_categoria: 'Sopa' },
            { id_categoria_menu: 2, nombre_categoria: 'Segundo' }
          ])
        });
      }
      if (url.includes('/alimentos') || url.includes('/productos') || url.includes('/menu')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Menu />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y carga las categorias del menu', async () => {
    await renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('icon-soup')).toBeInTheDocument();
    });
  });

  it('maneja errores al cargar categorias, alimentos, productos y menus', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Error intencional' }) });
    });
    await renderComponent();
    await waitFor(() => {
      expect(screen.queryByTestId('icon-soup')).not.toBeInTheDocument();
    });
  });

  it('valida que existan opciones para sopa y segundo al guardar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    const btnGuardar = screen.getByText('Guardar cambios');
    fireEvent.click(btnGuardar);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Debe haber al menos una sopa configurada');
    });
  });

  it('valida sopa y segundo al enviar a telegram', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    const btnEnviar = screen.getByText('ENVIAR MENÚ');
    fireEvent.click(btnEnviar);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Debe haber al menos una sopa configurada');
    });
  });

  it('permite guardar el menú cuando los datos son válidos', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de pollo']);
      menuStore.setCategoryOptions(2, ['Pollo al horno']);
    });

    const btnGuardar = screen.getByText('Guardar cambios');
    fireEvent.click(btnGuardar);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/menu/'),
        expect.objectContaining({ method: 'PUT' })
      );
      expect(toast.success).toHaveBeenCalledWith('Menu guardado correctamente');
    });
  });

  it('permite enviar el menú cuando los datos son válidos', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/enviar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de pollo']);
      menuStore.setCategoryOptions(2, ['Pollo al horno']);
    });

    const btnEnviar = screen.getByText('ENVIAR MENÚ');
    fireEvent.click(btnEnviar);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/menu/enviar',
        expect.objectContaining({ method: 'POST' })
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Menu enviado a n8n correctamente',
        expect.any(Object)
      );
    });
  });

  it('abre el diálogo de reenvío al recibir un 409 y permite cancelar o forzar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/enviar')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ code: 'ALREADY_SENT_CONFIRM_REQUIRED', error: 'Ya se ha enviado un menú el día de hoy' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de lentejas']);
      menuStore.setCategoryOptions(2, ['Lomo saltado']);
    });

    const btnEnviar = screen.getByText('ENVIAR MENÚ');
    fireEvent.click(btnEnviar);

    await screen.findByText('Advertencia de Reenvío');

    const btnCancelar = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(btnCancelar);
    await waitFor(() => expect(screen.queryByText('Advertencia de Reenvío')).not.toBeInTheDocument());

    fireEvent.click(btnEnviar);
    await screen.findByText('Advertencia de Reenvío');

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/enviar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const btnForzar = screen.getByRole('button', { name: 'Forzar Reenvío' });
    fireEvent.click(btnForzar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Menu enviado a n8n correctamente', expect.any(Object));
    });
  });

  it('permite limpiar las opciones de menú a través del diálogo de confirmación', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de ajo']);
    });

    const btnLimpiar = screen.getByRole('button', { name: 'Limpiar' });
    fireEvent.click(btnLimpiar);

    await waitFor(() => expect(screen.getByText('¿Limpiar Opciones?')).toBeInTheDocument());

    const btnConfirmar = screen.getByRole('button', { name: 'Sí, Limpiar' });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Formulario limpiado localmente', expect.any(Object));
    });
  });

  it('permite añadir y eliminar opciones de una categoria', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    const addBtns = screen.getAllByRole('button', { name: /Añadir Opción/i });
    fireEvent.click(addBtns[0]);

    const newOptions = menuStore.get().categoryOptions[1] || [];
    expect(newOptions.length).toBeGreaterThan(0);
    
    const trashBtns = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="icon-trash"]'));
    if(trashBtns.length > 0) {
      fireEvent.click(trashBtns[0]);
    }
  });

  it('muestra confirmación al intentar guardar con cambios que requieren confirmación y permite confirmar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options) => {
      if (url.includes('/menu/') && options?.body?.includes('"confirmarEdicion":false')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ requireConfirmation: true, error: 'Este menu esta activo. Confirma la edicion.' }),
        });
      }
      if (url.includes('/menu/') && options?.body?.includes('"confirmarEdicion":true')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de pollo']);
      menuStore.setCategoryOptions(2, ['Pollo al horno']);
    });

    const btnGuardar = screen.getByText('Guardar cambios');
    fireEvent.click(btnGuardar);

    await waitFor(() => expect(screen.getByText('¿Confirmar Edición?')).toBeInTheDocument());

    const btnConfirmar = screen.getByRole('button', { name: 'Sí, Confirmar' });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Menu guardado correctamente');
    });
  });
});
