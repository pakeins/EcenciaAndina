import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import Clientes from './Clientes';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
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
});
