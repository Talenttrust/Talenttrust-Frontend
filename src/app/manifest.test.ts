import { describe, expect, it } from 'vitest';
import manifest from './manifest';
import { viewport } from './layout';

describe('web app manifest', () => {
  it('includes the required app fields and launch URL', () => {
    const appManifest = manifest();

    expect(appManifest.name).toBeTruthy();
    expect(appManifest.short_name).toBeTruthy();
    expect(appManifest.description).toBeTruthy();
    expect(appManifest.display).toBe('standalone');
    expect(appManifest.background_color).toBe('#ffffff');
    expect(appManifest.start_url).toBe('/');
  });

  it('uses the same light theme color as the app viewport', () => {
    const appManifest = manifest();
    const themeColors = Array.isArray(viewport.themeColor)
      ? viewport.themeColor
      : viewport.themeColor
        ? [viewport.themeColor]
        : [];
    const lightViewportColor = themeColors.find(
      (color) => typeof color !== 'string' && color.media?.includes('light'),
    );

    expect(appManifest.theme_color).toBe(
      typeof lightViewportColor === 'string' ? lightViewportColor : lightViewportColor?.color,
    );
  });

  it('uses absolute paths for all icons', () => {
    expect(manifest().icons?.length).toBeGreaterThan(0);
    for (const icon of manifest().icons ?? []) {
      expect(icon.src).toMatch(/^\//);
    }
  });
});
