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

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    Plus: mockComponent('plus'),
    Pencil: mockComponent('pencil'),
    User: mockComponent('user'),
    Phone: mockComponent('phone'),
    Search: mockComponent('search'),
    IdCard: mockComponent('id-card'),
    Users: mockComponent('users'),
    Building2: mockComponent('building'),
    Activity: mockComponent('activity'),
    UserCheck: mockComponent('user-check'),
    Wallet: mockComponent('wallet'),
    Send: mockComponent('send'),
    ShieldCheck: mockComponent('shield-check'),
    Mail: mockComponent('mail'),
    Trash2: mockComponent('trash'),
    Banknote: mockComponent('banknote'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
    Check: mockComponent('check'),
    X: mockComponent('x'),
    Receipt: mockComponent('receipt'),
    RefreshCw: mockComponent('refresh-cw'),
    CheckCircle2: mockComponent('check-circle-2'),
    AlertTriangle: mockComponent('alert-triangle'),
    Loader2: mockComponent('loader2'),
    MessageCircle: mockComponent('message-circle'),
    FileText: mockComponent('file-text'),
    Clock: mockComponent('clock'),
  };
});

describe('Clientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
              tipo_nombre: 'Frecuente' 
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
  it('permite buscar clientes', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Nombre, cédula, teléfono o correo/i);
    
    // Simulate search
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '171234' } });
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

    const iconsEditar = await screen.findAllByTestId('icon-pencil');
    if (iconsEditar.length > 0) {
      const btnEditar = iconsEditar[0].closest('button');
      if (btnEditar) {
        await act(async () => {
          fireEvent.click(btnEditar);
        });
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        
        const btnGuardar = screen.getByRole('button', { name: /Guardar Cambios/i });
        await act(async () => {
          fireEvent.click(btnGuardar);
        });
      }
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
});
