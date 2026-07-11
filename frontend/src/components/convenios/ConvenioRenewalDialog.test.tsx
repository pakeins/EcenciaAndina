import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConvenioRenewalDialog } from './ConvenioRenewalDialog';

describe('ConvenioRenewalDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    convenioToRenew: { id: 'c1', nombre_empresa: 'Empresa Test' } as any,
    renewalDates: { fecha_inicio: '2023-01-01', fecha_caducidad: '2023-12-31' },
    setRenewalDates: vi.fn(),
    isSaving: false,
    onRenew: vi.fn(),
  };

  it('se renderiza correctamente y llama a onRenew', async () => {
    render(<ConvenioRenewalDialog {...defaultProps} />);
    expect(screen.getByText('Renovación de Convenio')).toBeInTheDocument();
    
    const btnRenew = screen.getByRole('button', { name: /Renovar y Activar/i });
    await act(async () => {
      fireEvent.click(btnRenew);
    });

    expect(defaultProps.onRenew).toHaveBeenCalled();
  });
});
