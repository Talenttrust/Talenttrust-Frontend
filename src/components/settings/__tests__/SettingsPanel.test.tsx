import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { PreferencesProvider } from '@/lib/preferences';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <PreferencesProvider>
      {ui}
    </PreferencesProvider>
  );
};

describe('SettingsPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProvider(
      <SettingsPanel isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when open', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    renderWithProvider(<SettingsPanel isOpen={true} onClose={onClose} />);
    
    const closeButton = screen.getByRole('button', { name: /Close settings/i });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('updates theme preference when theme button is clicked', () => {
    renderWithProvider(<SettingsPanel isOpen={true} onClose={() => {}} />);
    
    const darkButton = screen.getByText('dark');
    fireEvent.click(darkButton);
    
    // Check if it's active (has the primary class)
    expect(darkButton.className).toContain('bg-[var(--primary)]');
  });
});
