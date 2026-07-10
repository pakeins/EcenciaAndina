import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderState } from '@/types';

describe('OrderStatusBadge', () => {
  it('renderiza correctamente el estado reservado', () => {
    render(<OrderStatusBadge status={'reservado' as OrderState} />);
    expect(screen.getByText('reservado')).toBeInTheDocument();
  });

  it('renderiza correctamente el estado consumido', () => {
    render(<OrderStatusBadge status={'consumido' as OrderState} />);
    expect(screen.getByText('consumido')).toBeInTheDocument();
  });

  it('renderiza correctamente el estado cancelado', () => {
    render(<OrderStatusBadge status={'cancelado' as OrderState} />);
    expect(screen.getByText('cancelado')).toBeInTheDocument();
  });
});
