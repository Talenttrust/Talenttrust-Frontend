import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormField } from './FormField';
import { ErrorSummary } from './ErrorSummary';

describe('FormValidation Components', () => {
  describe('FormField', () => {
    it('renders label and child input', () => {
      render(
        <FormField label="Email" id="email">
          <input type="email" />
        </FormField>
      );
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'email');
    });

    it('displays helper text and links it with aria-describedby', () => {
      render(
        <FormField label="Password" id="password" helperText="Must be 8 characters">
          <input type="password" />
        </FormField>
      );
      const helper = screen.getByText('Must be 8 characters');
      const input = screen.getByLabelText(/Password/i);
      expect(helper).toHaveAttribute('id', 'password-helper');
      expect(input).toHaveAttribute('aria-describedby', 'password-helper');
    });

    it('displays error message and links it with aria-describedby', () => {
      render(
        <FormField label="Username" id="username" error="Username is required">
          <input type="text" />
        </FormField>
      );
      const error = screen.getByText('Username is required');
      const input = screen.getByLabelText(/Username/i);
      expect(error).toHaveAttribute('id', 'username-error');
      expect(input).toHaveAttribute('aria-describedby', 'username-error');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('combines helper text and error message in aria-describedby', () => {
      render(
        <FormField 
          label="Phone" 
          id="phone" 
          helperText="Format: 123-456-7890" 
          error="Invalid format"
        >
          <input type="tel" />
        </FormField>
      );
      const input = screen.getByLabelText(/Phone/i);
      expect(input).toHaveAttribute('aria-describedby', 'phone-error phone-helper');
    });
  });

  describe('ErrorSummary', () => {
    const errors = [
      { fieldId: 'name', message: 'Name is required' },
      { fieldId: 'email', message: 'Email is invalid' },
    ];

    it('renders nothing when there are no errors', () => {
      const { container } = render(<ErrorSummary errors={[]} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders error list with links to fields', () => {
      render(<ErrorSummary errors={errors} />);
      expect(screen.getByText('There is a problem')).toBeInTheDocument();
      
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', '#name');
      expect(links[0]).toHaveTextContent('Name is required');
      expect(links[1]).toHaveAttribute('href', '#email');
      expect(links[1]).toHaveTextContent('Email is invalid');
    });

    it('has role="alert" for accessibility', () => {
      render(<ErrorSummary errors={errors} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
