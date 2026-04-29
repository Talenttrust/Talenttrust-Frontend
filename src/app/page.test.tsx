import { render, screen } from '@testing-library/react';
import Home from './page';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </PreferencesProvider>
  );
};

describe('Home', () => {
  it('renders TalentTrust heading', () => {
    renderWithProviders(<Home />);
    expect(screen.getByRole('heading', { name: /TalentTrust/i })).toBeInTheDocument();
  });

  it('renders description paragraph', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText(/Decentralized Freelancer Escrow Protocol/i)).toBeInTheDocument();
  });

  it('has proper semantic structure', () => {
    const { container } = renderWithProviders(<Home />);
    expect(container.querySelector('main')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeInTheDocument();
  });
});
