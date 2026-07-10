import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavLink } from './NavLink';
import { MemoryRouter } from 'react-router-dom';

describe('NavLink', () => {
  it('aplica las clases correctamente al estar activo', () => {
    render(
      <MemoryRouter initialEntries={['/active']}>
        <NavLink 
          to="/active" 
          className="base-class" 
          activeClassName="active-class"
        >
          Link
        </NavLink>
      </MemoryRouter>
    );
    
    const link = screen.getByText('Link');
    expect(link).toHaveClass('base-class');
    expect(link).toHaveClass('active-class');
  });

  it('no aplica activeClassName cuando no esta activo', () => {
    render(
      <MemoryRouter initialEntries={['/other']}>
        <NavLink 
          to="/active" 
          className="base-class" 
          activeClassName="active-class"
        >
          Link
        </NavLink>
      </MemoryRouter>
    );
    
    const link = screen.getByText('Link');
    expect(link).toHaveClass('base-class');
    expect(link).not.toHaveClass('active-class');
  });
});
