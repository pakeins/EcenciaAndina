import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { TelegramPrivacyRequestsDialog } from './TelegramPrivacyRequestsDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('TelegramPrivacyRequestsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRequests = [
    {
      id: 'req1',
      status: 'pending',
      requested_at: '2023-10-01T10:00:00Z',
      retained_order_count: 2,
      clientes: { nombre: 'Luis', apellido: 'Gomez' }
    },
    {
      id: 'req2',
      status: 'in_review',
      requested_at: '2023-10-02T10:00:00Z',
      retained_order_count: 0,
      clientes: null // Cliente eliminado
    }
  ];

  it('se renderiza y carga las solicitudes', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRequests)
    });

    await act(async () => {
      render(
        <TelegramPrivacyRequestsDialog open={true} onOpenChange={vi.fn()} onResolved={vi.fn()} />
      );
    });

    expect(screen.getByText('Solicitudes de privacidad')).toBeInTheDocument();
    expect(screen.getByText('Luis Gomez')).toBeInTheDocument();
    expect(screen.getByText('Cliente eliminado')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/clientes/telegram/privacidad-solicitudes');
  });

  it('permite actualizar el estado a en revision', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRequests)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mensaje: 'Actualizado' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRequests) // reload
      });

    const onResolved = vi.fn();

    await act(async () => {
      render(
        <TelegramPrivacyRequestsDialog open={true} onOpenChange={vi.fn()} onResolved={onResolved} />
      );
    });

    const textareas = screen.getAllByRole('textbox');
    await act(async () => {
      fireEvent.change(textareas[0], { target: { value: 'En proceso de revision' } });
    });

    const btnRevision = screen.getByRole('button', { name: /Marcar en revision/i });
    await act(async () => {
      fireEvent.click(btnRevision);
    });

    expect(apiFetch).toHaveBeenCalledWith('/clientes/telegram/privacidad-solicitudes/req1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_review', resolution_notes: 'En proceso de revision' })
    }));

    expect(toast.success).toHaveBeenCalledWith('Solicitud actualizada.');
    expect(onResolved).toHaveBeenCalled();
  });

  it('maneja errores al cargar solicitudes', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Error del servidor' })
    });

    await act(async () => {
      render(
        <TelegramPrivacyRequestsDialog open={true} onOpenChange={vi.fn()} onResolved={vi.fn()} />
      );
    });

    expect(toast.error).toHaveBeenCalledWith('Error del servidor');
  });

  it('permite rechazar una solicitud', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRequests)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mensaje: 'Actualizado' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]) // empty after reload
      });

    await act(async () => {
      render(
        <TelegramPrivacyRequestsDialog open={true} onOpenChange={vi.fn()} onResolved={vi.fn()} />
      );
    });

    const btnsRechazar = screen.getAllByRole('button', { name: /Rechazar/i });
    await act(async () => {
      fireEvent.click(btnsRechazar[0]);
    });

    expect(apiFetch).toHaveBeenCalledWith('/clientes/telegram/privacidad-solicitudes/req1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    }));
  });

  it('permite resolver una solicitud', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRequests)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mensaje: 'Actualizado' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]) // empty after reload
      });

    await act(async () => {
      render(
        <TelegramPrivacyRequestsDialog open={true} onOpenChange={vi.fn()} onResolved={vi.fn()} />
      );
    });

    const btnsResolver = screen.getAllByRole('button', { name: /Resolver/i });
    await act(async () => {
      fireEvent.click(btnsResolver[0]);
    });

    expect(apiFetch).toHaveBeenCalledWith('/clientes/telegram/privacidad-solicitudes/req1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' })
    }));
  });
});
