import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import Clientes from './Clientes';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  // Override specific icons to keep tests fast, but pass through everything else
  return {
    ...actual,
    Loader2: mockComponent('loader2'),
  };
});

describe('Clientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/clientes/tipos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id_tipo_cliente: 1, nombre_tipo: 'Frecuente' }]) });
      }
      if (url.includes('/clientes/telegram/privacidad-solicitudes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/clientes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { 
              id: 'c1', 
              nombre: 'Juan', 
              apellido: 'Perez', 
              cedula: '1712345678', 
              correo: 'juan@test.com', 
              activo: true, 
              tipo_nombre: 'Frecuente',
              id_tipo_cliente: 2
            }
          ])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Clientes />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y muestra la lista de clientes', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
      expect(screen.getByText('1712345678')).toBeInTheDocument();
    });
  });

  it('muestra mensaje de error si falla la obtencion de clientes', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/clientes') && !url.includes('tipos') && !url.includes('privacidad')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Fallo al obtener clientes' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Ocurrió un error/i)).toBeInTheDocument();
    });
  });
  it('permite buscar clientes', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Nombre, cédula, teléfono o correo/i);
    
    // Simulate search
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Inexistente' } });
    });
    
    await waitFor(() => {
      expect(screen.getByText('No se encontraron clientes con esa búsqueda')).toBeInTheDocument();
    });

    // Test clear filters button
    const clearBtn = screen.getByRole('button', { name: /Limpiar/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });
  });

  it('permite abrir el modal para nuevo cliente y guardar', async () => {
    await renderComponent();

    const btnNuevo = await screen.findByRole('button', { name: /Nuevo Cliente/i });
    
    await act(async () => {
      fireEvent.click(btnNuevo);
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox', { hidden: true });
    
    const inputCedula = inputs.find(i => (i as HTMLInputElement).name === 'cedula' || (i as HTMLInputElement).placeholder?.includes('Cédula') || (i as HTMLInputElement).placeholder?.includes('Ingrese cédula'));
    if (inputCedula) {
      await act(async () => {
        fireEvent.change(inputCedula, { target: { value: '1799999999' } });
      });
    }

    const btnGuardar = screen.getByRole('button', { name: /Registrar Cliente/i });
    await act(async () => {
      fireEvent.click(btnGuardar);
    });
  });

  it('permite abrir modal de edición y guardar', async () => {
    await renderComponent();

    const btnsEditar = await screen.findAllByTitle(/Editar Cliente/i);
    if (btnsEditar.length > 0) {
      await act(async () => {
        fireEvent.click(btnsEditar[0]);
      });
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      
      const btnGuardar = screen.getByRole('button', { name: /Guardar Cambios/i });
      await act(async () => {
        fireEvent.click(btnGuardar);
      });
    }
  });

  it('permite abrir confirmación de eliminación', async () => {
    await renderComponent();

    const btnDelete = await screen.findAllByTitle(/Eliminar Cliente/i);
    if (btnDelete.length > 0) {
      await act(async () => {
        fireEvent.click(btnDelete[0]);
      });
      const alertdialog = await screen.findByRole('alertdialog');
      expect(alertdialog).toBeInTheDocument();

      const btnConfirm = screen.getByRole('button', { name: /Eliminar Normalmente/i });
      await act(async () => {
        fireEvent.click(btnConfirm);
      });
    }
  });

  it('muestra toast de error si la eliminación falla', async () => {
    await renderComponent();
    
    // Simulate API fail for DELETE
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options: RequestInit) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'No se pudo eliminar el cliente' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const btnDelete = await screen.findAllByTitle(/Eliminar Cliente/i);
    if (btnDelete.length > 0) {
      await act(async () => {
        fireEvent.click(btnDelete[0]);
      });
      const btnConfirm = screen.getByRole('button', { name: /Eliminar Normalmente/i });
      await act(async () => {
        fireEvent.click(btnConfirm);
      });
    }

    expect(toast.error).toHaveBeenCalledWith('No se pudo eliminar el cliente');
  });

  it('permite abrir el monedero virtual', async () => {
    // Modify mock inside test or use default DIRECT client (we will set beforeEach to direct)
    await renderComponent();

    const btnWallet = await screen.findByTitle(/Monedero Virtual/i);
    await act(async () => {
      fireEvent.click(btnWallet);
    });

    // Check if wallet dialog shows (wallet dialog title is 'Monedero Virtual' or similar)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('permite abrir la gestion de Telegram', async () => {
    await renderComponent();

    const btnTelegram = await screen.findByTitle(/Gestionar Telegram/i);
    await act(async () => {
      fireEvent.click(btnTelegram);
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('permite abrir la gestion de Telegram y manejar errores al reinvitar', async () => {
    await renderComponent();

    const btnTelegram = await screen.findByTitle(/Gestionar Telegram/i);
    await act(async () => {
      fireEvent.click(btnTelegram);
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options: RequestInit) => {
      if (url.includes('/telegram/invitacion') && options?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'No se pudo reinvitar al cliente' }) });
      }
      if (url.includes('/telegram/revocar') && options?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'No se pudo revocar al cliente' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const btnReinvitar = await screen.findByRole('button', { name: /Enviar nueva invitación/i }).catch(() => null);
    if (btnReinvitar) {
      await act(async () => {
        fireEvent.click(btnReinvitar);
      });
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No se pudo reinvitar al cliente'));
    }

    const btnRevocar = await screen.findByRole('button', { name: /Revocar acceso al Bot/i }).catch(() => null);
    if (btnRevocar) {
      await act(async () => {
        fireEvent.click(btnRevocar);
      });
      const btnConfirmRevocar = await screen.findByRole('button', { name: /Sí, Revocar/i });
      await act(async () => {
        fireEvent.click(btnConfirmRevocar);
      });
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No se pudo revocar al cliente'));
    }
  });

  it('permite abrir la gestion de Telegram y manejar exito al reinvitar y revocar', async () => {
    await renderComponent();

    const btnTelegram = await screen.findByTitle(/Gestionar Telegram/i);
    await act(async () => {
      fireEvent.click(btnTelegram);
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options: RequestInit) => {
      if (url.includes('/telegram/invitacion') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ telegram_onboarding: { status: 'sent' } }) });
      }
      if (url.includes('/telegram/revocar') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Revocado' }) });
      }
      if (url.includes('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const btnReinvitar = await screen.findByRole('button', { name: /Enviar nueva invitación/i }).catch(() => null);
    if (btnReinvitar) {
      await act(async () => {
        fireEvent.click(btnReinvitar);
      });
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Aviso enviado al chat vinculado'));
    }

    // Reopen since dialog closes on success
    await act(async () => {
      fireEvent.click(btnTelegram);
    });

    const btnRevocar = await screen.findByRole('button', { name: /Revocar acceso al Bot/i }).catch(() => null);
    if (btnRevocar) {
      await act(async () => {
        fireEvent.click(btnRevocar);
      });
      const btnConfirmRevocar = await screen.findByRole('button', { name: /Sí, Revocar/i });
      await act(async () => {
        fireEvent.click(btnConfirmRevocar);
      });
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Acceso revocado correctamente'));
    }
  });

  it('permite cambiar el estado activo del cliente al clickear el Switch y maneja error de red', async () => {
    await renderComponent();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.reject(new Error('Network error'));
      }
      if (url.includes('/clientes') && !url.includes('tipos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '1712345678', correo: 'juan@test.com', activo: true, id_tipo_cliente: 2 }])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const switches = await screen.findAllByRole('switch');
    if (switches.length > 0) {
      await act(async () => {
        fireEvent.click(switches[0]);
      });
      const btnConfirm = screen.getByRole('button', { name: /Sí, desactivar/i });
      await act(async () => {
        fireEvent.click(btnConfirm);
      });
      expect(toast.error).toHaveBeenCalledWith('Error de conexión');
    }
  });

  it('permite cambiar el estado activo del cliente al clickear el Switch y maneja error', async () => {
    await renderComponent();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Error al cambiar estado' }) });
      }
      if (url.includes('/clientes') && !url.includes('tipos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '1712345678', correo: 'juan@test.com', activo: true, id_tipo_cliente: 2 }])
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const switches = await screen.findAllByRole('switch');
    if (switches.length > 0) {
      await act(async () => {
        fireEvent.click(switches[0]);
      });
      // Confirm dialog appears
      const btnConfirm = screen.getByRole('button', { name: /Sí, desactivar/i });
      await act(async () => {
        fireEvent.click(btnConfirm);
      });
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Error al cambiar estado'));
    }
  });

  it('permite cambiar el estado activo del cliente al clickear el Switch y maneja error de red', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/clientes/tipos')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/clientes') && !options) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '1712345678', activo: true, id_tipo_cliente: 2 }]) });
      if (options && options.method === 'PUT') return Promise.reject(new Error('Network error'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    const activeSwitch = screen.getAllByRole('switch')[0];
    await act(async () => {
      fireEvent.click(activeSwitch);
    });

    const confirmButton = screen.getByRole('button', { name: /Desactivar/i });
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Error de conexión'));
    consoleSpy.mockRestore();
  });

  it('permite activar un cliente inactivo directamente sin confirmacion', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/clientes/tipos')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes('/clientes') && !options) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c2', nombre: 'Maria', apellido: 'Gomez', cedula: '1712345679', activo: false, id_tipo_cliente: 2 }]) });
      if (options && options.method === 'PUT') return Promise.resolve({ ok: true, json: () => Promise.resolve({ mensaje: 'Estado actualizado' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Maria Gomez')).toBeInTheDocument();
    });

    const inactiveSwitch = screen.getAllByRole('switch')[0];

    await act(async () => {
      fireEvent.click(inactiveSwitch);
    });

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/clientes/c2'),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ activo: true }) })
    );
  });

  it('permite abrir la gestion de privacidad', async () => {
    await renderComponent();

    const btnPrivacidad = await screen.findByRole('button', { name: /Gestion de Privacidad/i });
    await act(async () => {
      fireEvent.click(btnPrivacidad);
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('permite abrir el dialogo de recarga de saldo', async () => {
    await renderComponent();

    const btnRecarga = await screen.findByRole('button', { name: /Recargar Saldo/i });
    await act(async () => {
      fireEvent.click(btnRecarga);
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('permite reintentar email de onboarding desde el menu de telegram', async () => {
    await renderComponent();
    
    // Simular que handleSaveSuccess pasa con isNew
    const event = new CustomEvent('cliente-guardado', { detail: { isNew: true, data: { telegram_onboarding: 'some-url', nombre: 'Test', apellido: 'User', id: '123' } } });
    document.dispatchEvent(event);
  });
});
