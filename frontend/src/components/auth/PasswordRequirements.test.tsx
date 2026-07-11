import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PasswordRequirements } from './PasswordRequirements';

describe('PasswordRequirements', () => {
  it('no renderiza nada si no hay contraseña', () => {
    const { container } = render(<PasswordRequirements password="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza advertencias para una contraseña débil', () => {
    render(<PasswordRequirements password="weak" />);
    expect(screen.getByText('La contraseña debe contener:')).toBeInTheDocument();
    
    // Todos menos el de caracteres fallan (en este caso ni siquiera el de longitud)
    const lengthReq = screen.getByText('Al menos 8 caracteres');
    expect(lengthReq).toHaveClass('text-destructive');
  });

  it('marca todos como válidos para una contraseña fuerte', () => {
    render(<PasswordRequirements password="StrongPassw0rd!" />);
    const lengthReq = screen.getByText('Al menos 8 caracteres');
    const caseReq = screen.getByText('Mayúsculas y minúsculas');
    const numReq = screen.getByText('Un número');
    const specialReq = screen.getByText('Un carácter especial (@, $, !, etc.)');

    expect(lengthReq).toHaveClass('line-through');
    expect(caseReq).toHaveClass('line-through');
    expect(numReq).toHaveClass('line-through');
    expect(specialReq).toHaveClass('line-through');
  });
});
