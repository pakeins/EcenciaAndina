import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConvenioRenewalDialog } from './ConvenioRenewalDialog';

describe('ConvenioRenewalDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    convenioToRenew: { id: 'c1', nombre_empresa: 'Empresa Test' } as unknown,
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

  it('llama a setRenewalDates al cambiar la fecha de inicio y de fin', async () => {
    render(<ConvenioRenewalDialog {...defaultProps} />);
    
    const inputs = document.querySelectorAll('input[type="date"]');
    const inputInicio = inputs[0];
    const inputFin = inputs[1];

    fireEvent.change(inputInicio, { target: { value: '2026-07-15' } });
    expect(defaultProps.setRenewalDates).toHaveBeenCalledWith({
      fecha_inicio: '2026-07-15',
      fecha_caducidad: '2023-12-31',
    });

    fireEvent.change(inputFin, { target: { value: '2026-12-31' } });
    expect(defaultProps.setRenewalDates).toHaveBeenCalledWith({
      fecha_inicio: '2023-01-01',
      fecha_caducidad: '2026-12-31',
    });
  });

  it('llama a onOpenChange(false) al hacer clic en Cancelar', async () => {
    render(<ConvenioRenewalDialog {...defaultProps} />);
    
    const btnCancelar = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(btnCancelar);
    
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('retorna null si convenioToRenew es null', () => {
    const { container } = render(<ConvenioRenewalDialog {...defaultProps} convenioToRenew={null} />);
    expect(container.firstChild).toBeNull();
  });
});
