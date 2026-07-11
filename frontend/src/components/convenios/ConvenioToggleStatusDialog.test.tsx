import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConvenioToggleStatusDialog } from './ConvenioToggleStatusDialog';

describe('ConvenioToggleStatusDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    convenioToToggle: { id: 'c1', nombre_empresa: 'Empresa Test', activo: true } as any,
    onConfirm: vi.fn(),
  };

  it('se renderiza correctamente y llama a onConfirm', async () => {
    render(<ConvenioToggleStatusDialog {...defaultProps} />);
    expect(screen.getByText('¿Desactivar convenio?')).toBeInTheDocument();
    
    const btnConfirm = screen.getByRole('button', { name: /Sí, desactivar/i });
    await act(async () => {
      fireEvent.click(btnConfirm);
    });

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('c1', false);
  });
});
