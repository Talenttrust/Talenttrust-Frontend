import { useEffect, useState } from 'react';

export type AnnouncementPriority = 'polite' | 'assertive';

export interface Announcement {
  id: string;
  message: string;
  priority: AnnouncementPriority;
}

let globalAnnouncerListener: ((announcement: Announcement) => void) | null = null;

export function announceToScreenReader(message: string, priority: AnnouncementPriority = 'polite') {
  if (globalAnnouncerListener) {
    globalAnnouncerListener({
      id: Math.random().toString(36).substring(2, 9),
      message,
      priority,
    });
  }
}

export function useScreenReaderAnnouncer() {
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    globalAnnouncerListener = (announcement) => {
      setCurrentAnnouncement(announcement);
    };
    return () => {
      globalAnnouncerListener = null;
    };
  }, []);

  return currentAnnouncement;
}
