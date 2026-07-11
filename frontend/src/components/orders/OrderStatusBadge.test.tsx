import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OrderStatusBadge } from './OrderStatusBadge';

describe('OrderStatusBadge', () => {
  it('se renderiza correctamente con estado reservado', () => {
    render(<OrderStatusBadge status="reservado" />);
    const badge = screen.getByText('reservado');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-oro');
  });

  it('se renderiza correctamente con estado consumido', () => {
    render(<OrderStatusBadge status="consumido" />);
    const badge = screen.getByText('consumido');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary');
  });

  it('se renderiza correctamente con estado cancelado', () => {
    render(<OrderStatusBadge status="cancelado" />);
    const badge = screen.getByText('cancelado');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-terracota');
  });
});
