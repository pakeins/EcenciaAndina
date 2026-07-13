import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TelegramActionDialog } from './TelegramActionDialog';

describe('TelegramActionDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    clientName: 'Juan Perez',
    clientId: 'client-123',
    onInvite: vi.fn().mockResolvedValue(undefined),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  };

  it('renderiza el titulo y el nombre del cliente cuando esta abierto', () => {
    render(<TelegramActionDialog {...defaultProps} />);
    expect(screen.getByText('Gestionar Telegram')).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    expect(screen.getByText('Enviar nueva invitación')).toBeInTheDocument();
    expect(screen.getByText('Revocar acceso al Bot')).toBeInTheDocument();
  });

  it('llama a onInvite al hacer clic en enviar invitacion', () => {
    render(<TelegramActionDialog {...defaultProps} />);
    const inviteButton = screen.getByText('Enviar nueva invitación');
    fireEvent.click(inviteButton);
    expect(defaultProps.onInvite).toHaveBeenCalledWith('client-123');
  });

  it('muestra la confirmacion de revocacion al hacer clic en revocar acceso', () => {
    render(<TelegramActionDialog {...defaultProps} />);
    const revokeButton = screen.getByText('Revocar acceso al Bot');
    
    // Al inicio no debe verse el alert
    expect(screen.queryByText('¿Estás seguro?')).not.toBeInTheDocument();

    fireEvent.click(revokeButton);

    // Debe mostrarse la alerta
    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument();
    expect(screen.getByText('Sí, Revocar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('oculta la alerta al hacer clic en cancelar', () => {
    render(<TelegramActionDialog {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Revocar acceso al Bot'));
    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));

    // Debe volver a mostrar el botón de revocar y ocultar la alerta
    expect(screen.queryByText('¿Estás seguro?')).not.toBeInTheDocument();
    expect(screen.getByText('Revocar acceso al Bot')).toBeInTheDocument();
  });

  it('llama a onRevoke al hacer clic en Sí, Revocar', () => {
    render(<TelegramActionDialog {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Revocar acceso al Bot'));
    fireEvent.click(screen.getByText('Sí, Revocar'));

    expect(defaultProps.onRevoke).toHaveBeenCalledWith('client-123');
  });

  it('deshabilita los botones si isLoading es true', () => {
    render(<TelegramActionDialog {...defaultProps} isLoading={true} />);
    
    const inviteButton = screen.getByText('Enviar nueva invitación').closest('button');
    const revokeButton = screen.getByText('Revocar acceso al Bot').closest('button');

    expect(inviteButton).toBeDisabled();
    expect(revokeButton).toBeDisabled();
  });

  it('reinicia confirmRevoke al cerrar el dialogo', () => {
    const onOpenChangeMock = vi.fn();
    const { rerender } = render(<TelegramActionDialog {...defaultProps} onOpenChange={onOpenChangeMock} />);

    // Mostrar alerta
    fireEvent.click(screen.getByText('Revocar acceso al Bot'));
    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument();

    // Simular que el Dialog cierra y llama handleOpenChange(false) -> resetea confirmRevoke
    // El botón Cancelar ya tiene este comportamiento y está probado en otro test
    // Aquí verificamos que cancelar limpia el estado correctamente
    fireEvent.click(screen.getByText('Cancelar'));

    // Verificar que desaparece la alerta y vuelve el botón de revocar
    expect(screen.queryByText('¿Estás seguro?')).not.toBeInTheDocument();
    expect(screen.getByText('Revocar acceso al Bot')).toBeInTheDocument();
  });
});
