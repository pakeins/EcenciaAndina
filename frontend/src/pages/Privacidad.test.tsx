import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Privacidad from './Privacidad';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe('Privacidad', () => {
  it('se renderiza correctamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Privacidad />
        </BrowserRouter>
      </QueryClientProvider>
    );
  });
});
