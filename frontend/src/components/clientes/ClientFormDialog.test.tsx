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

vi.mock('@/components/ui/select', () => {
  return {
    Select: ({ children, value, onValueChange, disabled }: any) => (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange && onValueChange(e.target.value)}
        data-testid="mock-select"
      >
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  };
});


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

  it('permite editar un cliente existente, cambiar telefono, tipo y convenio, y cancelar', async () => {
    const editingClient = {
      id: 'c1',
      cedula: '1712345678',
      nombre: 'Juan',
      apellido: 'Perez',
      correo: 'juan@test.com',
      telefono: '022222222',
      id_tipo_cliente: 2, // Directo
      id_convenio: '',
    };

    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'c1', nombre: 'Juan Modificado' })
    });

    const props = {
      ...defaultProps,
      editingClient,
    };

    render(<ClientFormDialog {...props} />);

    expect(screen.getByText('Editar Cliente')).toBeInTheDocument();

    // Cambiar teléfono
    const inputTelefono = screen.getByLabelText(/Teléfono/i);
    fireEvent.change(inputTelefono, { target: { value: '0999999999a' } }); // non-digits should be filtered out
    expect(inputTelefono).toHaveValue('0999999999');

    // Cambiar tipo de cliente a convenio (1)
    const selects = screen.getAllByTestId('mock-select');
    const selectTipo = selects[0];
    await act(async () => {
      fireEvent.change(selectTipo, { target: { value: '1' } }); // 1 is Convenio
    });

    // Cambiar convenio
    const updatedSelects = await screen.findAllByTestId('mock-select');
    const selectConvenio = updatedSelects[1];
    await act(async () => {
      fireEvent.change(selectConvenio, { target: { value: 'conv1' } });
    });

    // Guardar cambios
    const btnGuardar = screen.getByRole('button', { name: /Guardar Cambios/i });
    await act(async () => {
      fireEvent.click(btnGuardar);
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/clientes/c1', expect.objectContaining({ method: 'PUT' }));
      expect(toast.success).toHaveBeenCalledWith('Cliente actualizado correctamente');
    });

    // Clic en Cancelar
    const btnCancelar = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(btnCancelar);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });
});
