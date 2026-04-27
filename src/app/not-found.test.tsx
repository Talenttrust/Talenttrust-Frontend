import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound page', () => {
  it('renders 404 heading and navigation links', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
  });
});
