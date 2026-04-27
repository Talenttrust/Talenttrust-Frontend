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

  it('renders description paragraph', () => {
    render(<Home />);
    expect(screen.getByText(/Safe, secure payments/i)).toBeInTheDocument();
  });

  it('renders Key Terms section', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /Key Terms/i })).toBeInTheDocument();
  });

  it('renders all key terms', () => {
    render(<Home />);
    expect(screen.getByText('Escrow')).toBeInTheDocument();
    expect(screen.getByText('Milestone')).toBeInTheDocument();
    expect(screen.getByText('Release')).toBeInTheDocument();
  });

  it('renders term descriptions', () => {
    render(<Home />);
    expect(screen.getByText(/Money held safely/i)).toBeInTheDocument();
    expect(screen.getByText(/project checkpoint/i)).toBeInTheDocument();
    expect(screen.getByText(/payment goes to the freelancer/i)).toBeInTheDocument();
  });

  it('has proper semantic structure', () => {
    const { container } = render(<Home />);
    expect(container.querySelector('main')).toBeInTheDocument();
    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelectorAll('dt')).toHaveLength(3);
    expect(container.querySelectorAll('dd')).toHaveLength(3);
  });
});
