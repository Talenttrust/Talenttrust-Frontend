'use client';

import React from 'react';
import { useScreenReaderAnnouncer } from '@/lib/accessibility/announcements';

export function ScreenReaderAnnouncer() {
  const announcement = useScreenReaderAnnouncer();

  if (!announcement) return null;

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
      >
        {announcement.priority === 'polite' ? announcement.message : ''}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
      >
        {announcement.priority === 'assertive' ? announcement.message : ''}
      </div>
    </>
  );
}
