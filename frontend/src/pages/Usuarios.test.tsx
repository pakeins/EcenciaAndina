import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Usuarios from './Usuarios';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

// Mock dependencias
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([])
  })
}));

// Mock Crypto API since it's not present in basic JSDOM
beforeAll(() => {
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 4294967296);
        }
        return arr;
      }
    }
  });
});

import { act, fireEvent, waitFor } from '@testing-library/react';

const mockUsers = [
  {
    id: 'u1',
    nombre: 'Ana',
    apellido: 'López',
    correo: 'ana@test.com',
    nombre_usuario: 'alopez',
    esta_activo: true,
    created_at: '2026-01-01',
    roles: { nombre_rol: 'Administrativo' },
    id_rol: '1',
  },
  {
    id: 'u2',
    nombre: 'Pedro',
    apellido: 'Gómez',
    correo: 'pedro@test.com',
    nombre_usuario: 'pgomez',
    esta_activo: false,
    created_at: '2026-01-02',
    roles: { nombre_rol: 'Operativo' },
    id_rol: '2',
  },
];

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('Usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (apiFetch as any).mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/empleados' && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockUsers) });
      }
      if (url === '/empleados' && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'u3', ...body, roles: { nombre_rol: 'Operativo' }, esta_activo: true }) });
      }
      if (url.includes('/estado') && options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...mockUsers[0], ...JSON.parse(options.body as string) }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  const renderComponent = async () => {
    await act(async () => {
      render(<Usuarios />);
    });
  };

  it('se renderiza y carga lista de empleados', async () => {
    await renderComponent();
    expect(screen.getByText(/Gestión de Empleados/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Ana López')).toBeInTheDocument();
      expect(screen.getByText('Pedro Gómez')).toBeInTheDocument();
    });
  });

  it('permite crear un nuevo empleado', async () => {
    await renderComponent();
    
    const btnNuevo = screen.getByText('Nuevo Empleado');
    fireEvent.click(btnNuevo);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const inputNombre = screen.getByLabelText('Nombre');
    const inputApellido = screen.getByLabelText('Apellido');
    const inputCorreo = screen.getByLabelText('Correo Electrónico');
    const inputUsuario = screen.getByLabelText('Nombre de Usuario');

    fireEvent.change(inputNombre, { target: { value: 'Carlos' } });
    fireEvent.change(inputApellido, { target: { value: 'Perez' } });
    fireEvent.change(inputCorreo, { target: { value: 'carlos@test.com' } });
    fireEvent.change(inputUsuario, { target: { value: 'cperez' } });

    // Autogenerar contraseña
    const btnGenerar = screen.getByText('Auto-generar');
    fireEvent.click(btnGenerar);

    const btnCrear = screen.getByRole('button', { name: 'Crear Empleado' });
    fireEvent.click(btnCrear);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Empleado creado correctamente');
      expect(screen.getByText('Carlos Perez')).toBeInTheDocument();
    });
  });

  it('permite editar un empleado', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const btnEditar = screen.getAllByTitle('Editar empleado')[0]; // Ana
    fireEvent.click(btnEditar);

    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    const inputNombre = screen.getByLabelText('Nombre');
    fireEvent.change(inputNombre, { target: { value: 'Anita' } });

    const btnGuardar = screen.getByText('Guardar Cambios');
    fireEvent.click(btnGuardar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Empleado actualizado correctamente');
      expect(screen.getByText('Anita López')).toBeInTheDocument();
    });
  });

  it('permite desactivar y activar un empleado', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    // Switch de estado para Ana (activo -> inactivo)
    const switchAna = screen.getAllByRole('switch')[0];
    fireEvent.click(switchAna);

    // Debe mostrar modal de confirmación
    await waitFor(() => expect(screen.getByText('¿Desactivar empleado?')).toBeInTheDocument());
    
    const btnConfirmar = screen.getByText('Sí, desactivar');
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Acceso revocado'));
    });

    // Activar Pedro (inactivo -> activo) que no tiene modal
    const switchPedro = screen.getAllByRole('switch')[1];
    fireEvent.click(switchPedro);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Acceso concedido'));
    });
  });

  it('permite enviar enlace de restablecimiento de contraseña', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const btnEditar = screen.getAllByTitle('Editar empleado')[0];
    fireEvent.click(btnEditar);

    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    const btnReset = screen.getByRole('button', { name: /Enviar enlace por correo/i });
    fireEvent.click(btnReset);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Enlace enviado a Ana'));
    });
  });

  it('muestra el botón Actualizar deshabilitado con datos inválidos', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const btnEditar = screen.getAllByTitle('Editar empleado')[0];
    fireEvent.click(btnEditar);

    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    // Activar sección de cambio de contraseña
    const switchPass = screen.getByRole('button', { name: /Cambiar contraseña ahora/i });
    fireEvent.click(switchPass);

    // El botón debe estar deshabilitado al inicio (vacío)
    const btnActualizar = screen.getByRole('button', { name: 'Actualizar' });
    expect(btnActualizar).toBeDisabled();

    // Contraseñas no coinciden
    const inputPass = screen.getByLabelText(/^nueva contraseña$/i);
    const inputConfirm = screen.getByLabelText(/confirmar contraseña/i);
    fireEvent.change(inputPass, { target: { value: 'Pass12345!' } });
    fireEvent.change(inputConfirm, { target: { value: 'Diferente1!' } });
    expect(btnActualizar).toBeDisabled();

    // Contraseña inválida/débil
    fireEvent.change(inputConfirm, { target: { value: 'Pass12345!' } });
    fireEvent.change(inputPass, { target: { value: 'débil' } });
    fireEvent.change(inputConfirm, { target: { value: 'débil' } });
    expect(btnActualizar).toBeDisabled();
  });

  it('permite cambiar contraseña exitosamente', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const btnEditar = screen.getAllByTitle('Editar empleado')[0];
    fireEvent.click(btnEditar);

    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    const switchPass = screen.getByRole('button', { name: /Cambiar contraseña ahora/i });
    fireEvent.click(switchPass);

    const inputPass = screen.getByLabelText(/^nueva contraseña$/i);
    const inputConfirm = screen.getByLabelText(/confirmar contraseña/i);
    
    // Contraseña fuerte válida
    fireEvent.change(inputPass, { target: { value: 'Valida123!' } });
    fireEvent.change(inputConfirm, { target: { value: 'Valida123!' } });

    const btnActualizar = screen.getByRole('button', { name: 'Actualizar' });
    expect(btnActualizar).not.toBeDisabled();
    fireEvent.click(btnActualizar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Contraseña actualizada correctamente');
    });
  });



  it('permite auto-generar contraseña', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const editBtns = await screen.findAllByTitle('Editar empleado');
    fireEvent.click(editBtns[0]);
    
    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    const changePwdBtn = screen.getByRole('button', { name: /Cambiar contraseña ahora/i });
    fireEvent.click(changePwdBtn);
    
    const autoGenBtn = await screen.findByRole('button', { name: /Auto-generar/i });
    fireEvent.click(autoGenBtn);
    
    const pwdInput = await screen.findByPlaceholderText('Escriba la nueva contraseña') as HTMLInputElement;
    expect(pwdInput.value.length).toBeGreaterThan(0);
  });

  it('permite cancelar el cambio de contraseña', async () => {
    await renderComponent();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeInTheDocument());

    const editBtns = await screen.findAllByTitle('Editar empleado');
    fireEvent.click(editBtns[0]);
    
    await waitFor(() => expect(screen.getByText('Editar Empleado')).toBeInTheDocument());

    const changePwdBtn = screen.getByRole('button', { name: /Cambiar contraseña ahora/i });
    fireEvent.click(changePwdBtn);
    
    const cancelBtns = await screen.findAllByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtns[0]);
    
    expect(screen.queryByPlaceholderText('Escriba la nueva contraseña')).toBeNull();
  });

  it('muestra el modal de confirmación al intentar desactivar y permite cancelar o confirmar', async () => {
    await renderComponent();
    const toggleBtns = await screen.findAllByRole('switch');
    
    // Intentar desactivar al primer usuario (que esta activo)
    fireEvent.click(toggleBtns[0]);
    
    const confirmDialog = await screen.findByText('¿Desactivar empleado?');
    expect(confirmDialog).not.toBeNull();
    
    const cancelBtn = await screen.findByText('Cancelar');
    fireEvent.click(cancelBtn);
    
    // Volver a abrir y confirmar
    fireEvent.click(toggleBtns[0]);
    const confirmAction = await screen.findByText('Sí, desactivar');
    fireEvent.click(confirmAction);
    
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  it('maneja fallos de red/API al cambiar estado', async () => {
    await renderComponent();
    
    // Fallar la siguiente peticion (el PUT)
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Network error'));
    
    const toggleBtns = await screen.findAllByRole('switch');
    fireEvent.click(toggleBtns[0]);
    
    const confirmAction = await screen.findByText('Sí, desactivar');
    fireEvent.click(confirmAction);
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error de conexión');
    });
  });
});

