import { renderHook, act } from '@testing-library/react';
import { useToast, toast, reducer } from './use-toast';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('use-toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Limpiar estado global
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.dismiss();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('debería añadir un toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({
        title: 'Prueba',
        description: 'Esto es una prueba',
      });
    });

    expect(result.current.toasts.length).toBeGreaterThan(0);
    expect(result.current.toasts[0].title).toBe('Prueba');
    expect(result.current.toasts[0].open).toBe(true);
  });

  it('debería actualizar un toast', () => {
    const { result } = renderHook(() => useToast());
    
    let toastId = '';
    act(() => {
      const { id } = toast({ title: 'Original' });
      toastId = id;
    });

    act(() => {
      const t = result.current.toast;
      t({ title: 'Modificado' });
    });
    
    act(() => {
      const t = toast({ title: 'Para actualizar' });
      t.update({ title: 'Actualizado' });
    });

    expect(result.current.toasts[0].title).toBe('Actualizado');
  });

  it('debería descartar un toast (dismiss)', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'Para descartar' });
    });

    const currentToasts = result.current.toasts;
    expect(currentToasts[0].open).toBe(true);

    act(() => {
      result.current.dismiss(currentToasts[0].id);
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  it('debería remover el toast luego del delay', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'Removible' });
    });

    const toastId = result.current.toasts[0].id;

    act(() => {
      result.current.dismiss(toastId);
    });

    act(() => {
      vi.advanceTimersByTime(1000000);
    });

    expect(result.current.toasts.find((t) => t.id === toastId)).toBeUndefined();
  });

  it('testea el onOpenChange falso', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'onOpenChange' });
    });

    const t = result.current.toasts[0];
    act(() => {
      if (t.onOpenChange) {
        t.onOpenChange(false);
      }
    });

    expect(result.current.toasts[0].open).toBe(false);
  });

  describe('reducer interno', () => {
    it('ADD_TOAST', () => {
      const state = { toasts: [] };
      const action: any = { type: 'ADD_TOAST', toast: { id: '1', title: 't1' } };
      const next = reducer(state, action);
      expect(next.toasts.length).toBe(1);
    });

    it('UPDATE_TOAST', () => {
      const state = { toasts: [{ id: '1', title: 't1' }] as any[] };
      const action: any = { type: 'UPDATE_TOAST', toast: { id: '1', title: 'modificado' } };
      const next = reducer(state, action);
      expect(next.toasts[0].title).toBe('modificado');
    });

    it('DISMISS_TOAST sin id descarta todos', () => {
      const state = { toasts: [{ id: '1', open: true }, { id: '2', open: true }] as any[] };
      const action: any = { type: 'DISMISS_TOAST' };
      const next = reducer(state, action);
      expect(next.toasts[0].open).toBe(false);
      expect(next.toasts[1].open).toBe(false);
    });

    it('REMOVE_TOAST sin id borra todos', () => {
      const state = { toasts: [{ id: '1' }] as any[] };
      const action: any = { type: 'REMOVE_TOAST' };
      const next = reducer(state, action);
      expect(next.toasts.length).toBe(0);
    });
    
    it('REMOVE_TOAST con id especifico', () => {
      const state = { toasts: [{ id: '1' }, { id: '2' }] as any[] };
      const action: any = { type: 'REMOVE_TOAST', toastId: '1' };
      const next = reducer(state, action);
      expect(next.toasts.length).toBe(1);
      expect(next.toasts[0].id).toBe('2');
    });
  });
});
