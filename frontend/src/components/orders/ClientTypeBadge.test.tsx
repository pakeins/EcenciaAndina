import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ClientTypeBadge } from './ClientTypeBadge';

describe('ClientTypeBadge', () => {
  it('se renderiza correctamente para cliente de convenio', () => {
    render(<ClientTypeBadge type="convenio" />);
    expect(screen.getByText('Cliente de convenio')).toBeInTheDocument();
  });

  it('se renderiza correctamente para cliente frecuente', () => {
    render(<ClientTypeBadge type="prepago" />);
    expect(screen.getByText('Cliente frecuente')).toBeInTheDocument();
  });
});
