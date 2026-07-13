import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import Menu from './Menu';
import { apiFetch } from '@/lib/api';
import { menuStore } from '@/data/menuStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

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

import { toast } from 'sonner';

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

// Mock canvas from buildTelegramMenuImage
vi.mock('@/lib/menuImage', () => ({
  buildTelegramMenuImage: vi.fn(() => 'data:image/png;base64,fake'),
}));

describe('Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
      if (url.includes('/alimentos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/productos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/menu')) {
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
      expect(screen.getAllByTestId('icon-calendar-days')[0]).toBeInTheDocument();
      expect(screen.getByTestId('icon-soup')).toBeInTheDocument();
    });
  });

  it('valida que existan opciones para sopa y segundo al guardar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    const btnGuardar = screen.getByText('Guardar cambios');
    fireEvent.click(btnGuardar);

    // Debe mostrar error porque no hay opciones
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

    // Mock successful fetch for saving
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    // Agregar opciones válidas manualmente al store
    act(() => {
      menuStore.setCategoryOptions(1, ['Sopa de pollo']); // id 1 = Sopa
      menuStore.setCategoryOptions(2, ['Pollo al horno']); // id 2 = Segundo
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
      menuStore.setCategoryOptions(1, ['Sopa de pollo']); // id 1 = Sopa
      menuStore.setCategoryOptions(2, ['Pollo al horno']); // id 2 = Segundo
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

    // Mock de conflicto al enviar
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/menu/enviar')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ code: 'ALREADY_SENT_CONFIRM_REQUIRED' }),
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

    // Debe aparecer la advertencia
    await screen.findByText('Advertencia de Reenvío');

    // Probar Cancelar
    const btnCancelar = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(btnCancelar);
    await waitFor(() => expect(screen.queryByText('Advertencia de Reenvío')).not.toBeInTheDocument());

    // Hacer que responda exitosamente al forzar
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

    // Buscar modal de confirmación
    expect(screen.getByText('¿Limpiar Opciones?')).toBeInTheDocument();

    const btnConfirmar = screen.getByRole('button', { name: 'Sí, Limpiar' });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Formulario limpiado localmente', expect.any(Object));
    });
  });

  it('permite añadir y eliminar opciones de una categoria', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    // Añadir opcion
    const addBtns = screen.getAllByRole('button', { name: /Añadir Opción/i });
    fireEvent.click(addBtns[0]); // Añadir opcion a Sopa (cat 1)

    // Verificar que se añadió
    const newOptions = menuStore.get().categoryOptions[1] || [];
    expect(newOptions.length).toBeGreaterThan(0);
    
    // Eliminar opcion (deberia aparecer el boton con el ícono trash)
    // El boton trash tiene un titulo o un icono, podemos usar getAllByTestId o getByRole
    const trashBtns = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="icon-trash"]'));
    if(trashBtns.length > 0) {
      fireEvent.click(trashBtns[0]);
    }
  });

  it('muestra confirmación al intentar guardar con cambios que requieren confirmación y permite confirmar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    // Mock de confirmación requerida
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
      menuStore.setCategoryOptions(1, ['Sopa de pollo']); // id 1 = Sopa
      menuStore.setCategoryOptions(2, ['Pollo al horno']); // id 2 = Segundo
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

  it('muestra confirmación al limpiar opciones y permite confirmar', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByTestId('icon-soup')).toBeInTheDocument());

    const btnLimpiar = screen.getByRole('button', { name: 'Limpiar' });
    fireEvent.click(btnLimpiar);

    await waitFor(() => expect(screen.getByText('¿Limpiar Opciones?')).toBeInTheDocument());

    const btnConfirmar = screen.getByRole('button', { name: 'Sí, Limpiar' });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Formulario limpiado localmente', expect.any(Object));
    });
  });
});
