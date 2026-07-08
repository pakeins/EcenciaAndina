import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Convenios from './Convenios';

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

describe('Convenios', () => {
  it('se renderiza correctamente (smoke test para cobertura)', () => {
    render(<Convenios />);
    expect(screen.getByText(/Gestión de Convenios/i)).toBeInTheDocument();
  });
});
