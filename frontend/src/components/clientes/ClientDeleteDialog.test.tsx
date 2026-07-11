import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ClientDeleteDialog } from './ClientDeleteDialog';

describe('ClientDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    clientToDelete: { id: 'c1', nombre: 'Juan', apellido: 'Perez', activo: true, cedula: '123' } as any,
    isAdmin: true,
    onConfirm: vi.fn(),
  };

  it('se renderiza correctamente', () => {
    render(<ClientDeleteDialog {...defaultProps} />);
    expect(screen.getByText('Eliminar Cliente')).toBeInTheDocument();
    expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
  });

  it('llama a onConfirm con false para borrado normal', async () => {
    render(<ClientDeleteDialog {...defaultProps} />);

    const btnNormal = screen.getByRole('button', { name: /Eliminar Normalmente/i });
    await act(async () => {
      fireEvent.click(btnNormal);
    });

    expect(defaultProps.onConfirm).toHaveBeenCalledWith(false);
  });

  it('llama a onConfirm con true para borrado forzado si es admin', async () => {
    render(<ClientDeleteDialog {...defaultProps} />);

    const btnForzado = screen.getByRole('button', { name: /Borrado Forzado Permanentemente/i });
    await act(async () => {
      fireEvent.click(btnForzado);
    });

    expect(defaultProps.onConfirm).toHaveBeenCalledWith(true);
  });
});
