import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import NotFound from './NotFound';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe('NotFound', () => {
  it('se renderiza correctamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NotFound />
        </BrowserRouter>
      </QueryClientProvider>
    );
  });
});
