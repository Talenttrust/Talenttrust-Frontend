import { render, screen } from '@testing-library/react';
import Home from './page';
import { ToastProvider } from '@/components/toast/toast-provider';

describe('Home', () => {
  it('renders TalentTrust heading', () => {
    render(
      <ToastProvider>
        <Home />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { name: /TalentTrust/i })).toBeInTheDocument();
  });
});
