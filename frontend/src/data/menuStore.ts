import { useSyncExternalStore } from 'react';

interface MenuState {
  categoryOptions: Record<number, string[]>;
  image: string | null;
}

let state: MenuState = {
  categoryOptions: {},
  image: null,
};

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const getSnapshot = () => state;

export const menuStore = {
  get: () => state,

  setCategoryOptions: (categoryId: number, options: string[]) => {
    state = {
      ...state,
      categoryOptions: {
        ...state.categoryOptions,
        [categoryId]: options,
      },
    };
    emit();
  },

  setDailyImage: (image: string | null) => {
    state = {
      ...state,
      image,
    };
    emit();
  },

  reset: () => {
    state = { categoryOptions: {}, image: null };
    emit();
  },
};

export function useMenu() {
  const currentState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return currentState;
}
