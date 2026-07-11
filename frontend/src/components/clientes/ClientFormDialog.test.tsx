import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ClientFormDialog } from './ClientFormDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('@/lib/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation')>();
  return {
    ...actual,
    isValidEcDocument: vi.fn().mockReturnValue(true), // Mock validation
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('ClientFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    editingClient: null,
    clientTypes: [{ id_tipo_cliente: 1, nombre_tipo: 'Directo' }, { id_tipo_cliente: 2, nombre_tipo: 'Convenio' }],
    convenios: [{ id: 'conv1', nombre_empresa: 'Empresa Test', activo: true }],
    isAdmin: true,
    onSuccess: vi.fn(),
  };

  it('se renderiza correctamente para nuevo cliente', () => {
    render(<ClientFormDialog {...defaultProps} />);
    expect(screen.getByText('Nuevo Cliente')).toBeInTheDocument();
    expect(screen.getByText('Registre un nuevo cliente')).toBeInTheDocument();
  });

  it('muestra validación cuando faltan campos requeridos', async () => {
    render(<ClientFormDialog {...defaultProps} />);
    
    const btnGuardar = screen.getByRole('button', { name: /Registrar Cliente/i });
    await act(async () => {
      fireEvent.click(btnGuardar);
    });

    expect(toast.error).toHaveBeenCalledWith('Cedula, nombre, apellido y correo son requeridos');
  });

  it('llama a la API para guardar el cliente cuando los datos son válidos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new1', nombre: 'Juan' })
    });

    render(<ClientFormDialog {...defaultProps} />);

    // Llenar datos
    fireEvent.change(screen.getByLabelText(/Cédula/i), { target: { value: '1712345678' } });
    fireEvent.change(screen.getByLabelText(/Nombre \*/i), { target: { value: 'Juan' } });
    fireEvent.change(screen.getByLabelText(/Apellido/i), { target: { value: 'Perez' } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'juan@test.com' } });

    const btnGuardar = screen.getByRole('button', { name: /Registrar Cliente/i });
    await act(async () => {
      fireEvent.click(btnGuardar);
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/clientes', expect.any(Object));
      expect(toast.success).toHaveBeenCalledWith('Cliente registrado correctamente');
      expect(defaultProps.onSuccess).toHaveBeenCalled();
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
