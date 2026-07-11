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
    (apiFetch as any).mockImplementation((url: string, options?: any) => {
      if (url === '/empleados' && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockUsers) });
      }
      if (url === '/empleados' && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'u3', ...body, roles: { nombre_rol: 'Operativo' }, esta_activo: true }) });
      }
      if (url.includes('/estado') && options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...mockUsers[0], ...JSON.parse(options.body) }) });
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
});
