import { describe, expect, it } from 'vitest';
import { menuStore } from './menuStore';

describe('menuStore', () => {
  it('actualiza todas las secciones del menu y la imagen diaria', () => {
    menuStore.setEntradas(['Bolon']);
    menuStore.setSopas(['Locro']);
    menuStore.setSegundos(['Pollo al horno']);
    menuStore.setPostres(['Flan']);
    menuStore.setBebidas(['Jugo de mora']);
    menuStore.setGuarniciones(['Ensalada']);
    menuStore.setDailyImage('data:image/jpeg;base64,abc');

    const state = menuStore.get().dailyMenu;

    expect(state.entradas).toEqual(['Bolon']);
    expect(state.sopas).toEqual(['Locro']);
    expect(state.segundos).toEqual(['Pollo al horno']);
    expect(state.postres).toEqual(['Flan']);
    expect(state.bebidas).toEqual(['Jugo de mora']);
    expect(state.guarniciones).toEqual(['Ensalada']);
    expect(state.image).toBe('data:image/jpeg;base64,abc');
  });

  it('setSection actualiza una seccion arbitraria por nombre', () => {
    menuStore.setSection('postres', ['Cheesecake', 'Brownie']);
    expect(menuStore.get().dailyMenu.postres).toEqual(['Cheesecake', 'Brownie']);
  });
});
