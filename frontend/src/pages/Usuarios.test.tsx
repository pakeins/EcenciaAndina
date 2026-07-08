import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import Usuarios from './Usuarios';

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

describe('Usuarios', () => {
  it('se renderiza correctamente', () => {
    render(<Usuarios />);
    // La página muestra Gestión de Empleados
    expect(screen.getByText(/Gestión de Empleados/i)).toBeInTheDocument();
  });
});
