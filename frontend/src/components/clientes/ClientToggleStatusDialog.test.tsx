import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ClientToggleStatusDialog } from './ClientToggleStatusDialog';

describe('ClientToggleStatusDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    clientToToggle: { id: 'c1', nombre: 'Juan', apellido: 'Perez', activo: true, cedula: '123' } as unknown,
    onConfirm: vi.fn(),
  };

  it('se renderiza correctamente y llama a onConfirm', async () => {
    render(<ClientToggleStatusDialog {...defaultProps} />);
    expect(screen.getByText('¿Desactivar cliente?')).toBeInTheDocument();
    
    const btnConfirm = screen.getByRole('button', { name: /Sí, desactivar/i });
    await act(async () => {
      fireEvent.click(btnConfirm);
    });

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('c1', false);
  });
});
