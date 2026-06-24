import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import Home from './page';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';
import { testA11y } from '@/test-utils/a11y';

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
  it('renders TalentTrust heading as h2 (not h1, since layout provides header)', () => {
    renderWithProviders(<Home />);
    const heading = screen.getByRole('heading', { name: /TalentTrust/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
  });

  it('renders description paragraph', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText(/Decentralized Freelancer Escrow Protocol/i)).toBeInTheDocument();
  });

  it('has no nested main landmark in page component (layout provides the single main)', () => {
    const { container } = renderWithProviders(<Home />);
    // The Home component itself should not render a <main> element
    // The layout provides the single <main id="main-content"> landmark
    const pageContent = container.querySelector('div'); // The root div of Home component
    expect(pageContent?.querySelector('main')).not.toBeInTheDocument();
  });

  it('has no h1 in the page component (layout header provides the page title)', () => {
    const { container } = renderWithProviders(<Home />);
    // The page component should not render an h1
    const pageContent = container.querySelector('div'); // The root div of Home component
    expect(pageContent?.querySelector('h1')).not.toBeInTheDocument();
    // It should have an h2 instead
    expect(pageContent?.querySelector('h2')).toBeInTheDocument();
  });

  it('displays validation errors on empty submission', () => {
    renderWithProviders(<Home />);
    
    // Submit form empty
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Check that ErrorSummary and error messages are rendered
    expect(screen.getByRole('alert', { name: /There is a problem/i })).toBeInTheDocument();
    expect(screen.getAllByText('Email is required')).toHaveLength(2);
    expect(screen.getAllByText('Password is required')).toHaveLength(2);
  });

  it('displays specific validation error for invalid email and short password', () => {
    renderWithProviders(<Home />);

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(screen.getAllByText('Email must be valid')).toHaveLength(2);
    expect(screen.getAllByText('Password must be at least 8 characters')).toHaveLength(2);
  });

  it('shows success toast on valid submission', () => {
    renderWithProviders(<Home />);

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Check that toast notification is triggered and rendered in ToastViewport
    expect(screen.getByRole('status')).toHaveTextContent('Form submitted successfully!');
  });

  it('has no accessibility violations on render (empty state)', async () => {
    const { container } = renderWithProviders(<Home />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no accessibility violations when errors are displayed', async () => {
    const { container } = renderWithProviders(<Home />);
    
    // Submit form empty to trigger errors
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no accessibility violations with valid form data', async () => {
    const { container } = renderWithProviders(<Home />);

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('focuses the error summary when errors appear', () => {
    renderWithProviders(<Home />);
    
    // Submit form empty to trigger errors
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    const errorSummary = screen.getByRole('alert', { name: /There is a problem/i });
    expect(errorSummary).toBeInTheDocument();
    
    // The ErrorSummary element should have received focus via ref
    expect(errorSummary).toHaveFocus();
  });

  it('error summary anchors correctly target form field ids', () => {
    renderWithProviders(<Home />);
    
    // Submit form empty to trigger errors
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    const errorSummary = screen.getByRole('alert', { name: /There is a problem/i });
    const errorLinks = errorSummary.querySelectorAll('a');
    
    // Should have links for email and password errors
    expect(errorLinks.length).toBeGreaterThan(0);
    
    // Check that links point to correct field ids
    errorLinks.forEach(link => {
      const href = link.getAttribute('href');
      expect(href).toMatch(/^#(email|password)$/);
      
      // Verify the target element exists
      const fieldId = href?.substring(1); // Remove the #
      const targetElement = document.getElementById(fieldId || '');
      expect(targetElement).toBeInTheDocument();
    });
  });

  it('has inputs that are properly labelled and described by error elements when errors occur', () => {
    renderWithProviders(<Home />);
    
    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();

    // Trigger validation errors
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Check aria-describedby and aria-invalid on inputs
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'email-error');

    const emailError = screen.getAllByText('Email is required').find(
      (el) => el.id === 'email-error'
    );
    expect(emailError).toBeInTheDocument();

    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput).toHaveAttribute('aria-describedby', 'password-error');

    const passwordError = screen.getAllByText('Password is required').find(
      (el) => el.id === 'password-error'
    );
    expect(passwordError).toBeInTheDocument();
  });

  it('uses testA11y helper for empty state', async () => {
    await testA11y(
      <PreferencesProvider>
        <ToastProvider>
          <Home />
        </ToastProvider>
      </PreferencesProvider>
    );
  });

  it('uses testA11y helper for error state', async () => {
    const view = renderWithProviders(<Home />);
    
    // Submit form empty to trigger errors
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    
    const results = await axe(view.container);
    expect(results).toHaveNoViolations();
  });
});


