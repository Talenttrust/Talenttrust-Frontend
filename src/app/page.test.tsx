import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders TalentTrust heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /TalentTrust/i })).toBeInTheDocument();
  });
});
