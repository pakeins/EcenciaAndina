import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClientTypeBadge } from './ClientTypeBadge';
import { ClientType } from '@/types';

describe('ClientTypeBadge', () => {
  it('renderiza cliente frecuente', () => {
    render(<ClientTypeBadge type={'frecuente' as ClientType} />);
    expect(screen.getByText('Cliente frecuente')).toBeInTheDocument();
  });

  it('renderiza cliente convenio', () => {
    render(<ClientTypeBadge type={'convenio' as ClientType} />);
    expect(screen.getByText('Cliente de convenio')).toBeInTheDocument();
  });
});
