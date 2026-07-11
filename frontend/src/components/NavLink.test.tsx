import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavLink } from './NavLink';

let mockIsActive = false;
let mockIsPending = false;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    NavLink: ({ className, children, to, ...props }: { className: string | ((props: { isActive: boolean; isPending: boolean }) => string); children: React.ReactNode; to: string; [key: string]: unknown }) => {
      const cls = typeof className === 'function' 
        ? className({ isActive: mockIsActive, isPending: mockIsPending }) 
        : className;
      return <a href={to} className={cls} {...props}>{children}</a>;
    }
  };
});

describe('NavLink', () => {
  it('aplica las clases correctamente al estar activo', () => {
    mockIsActive = true;
    mockIsPending = false;
    
    render(
      <NavLink 
        to="/active" 
        className="base-class" 
        activeClassName="active-class"
      >
        Link
      </NavLink>
    );
    
    const link = screen.getByText('Link');
    expect(link).toHaveClass('base-class');
    expect(link).toHaveClass('active-class');
    expect(link).not.toHaveClass('pending-class');
  });

  it('no aplica activeClassName cuando no esta activo', () => {
    mockIsActive = false;
    mockIsPending = false;
    
    render(
      <NavLink 
        to="/active" 
        className="base-class" 
        activeClassName="active-class"
      >
        Link
      </NavLink>
    );
    
    const link = screen.getByText('Link');
    expect(link).toHaveClass('base-class');
    expect(link).not.toHaveClass('active-class');
    expect(link).not.toHaveClass('pending-class');
  });

  it('aplica pendingClassName cuando esta pendiente', () => {
    mockIsActive = false;
    mockIsPending = true;
    
    render(
      <NavLink 
        to="/active" 
        className="base-class" 
        activeClassName="active-class"
        pendingClassName="pending-class"
      >
        Link
      </NavLink>
    );
    
    const link = screen.getByText('Link');
    expect(link).toHaveClass('base-class');
    expect(link).not.toHaveClass('active-class');
    expect(link).toHaveClass('pending-class');
  });
});
