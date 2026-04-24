import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders TalentTrust heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1, name: /TalentTrust/i })).toBeInTheDocument();
  });

  it('renders the demo form', () => {
    render(<Home />);
    expect(screen.getByText(/Demo: Standardized Form Validation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });
});
