'use client';

import React, { useEffect, useState } from 'react';
import type { Reputation } from '@/types/domain';
import ReputationPageClient from './ReputationPageClient';
import { listReputationEvents } from '@/lib/repository';

const ReputationPage: React.FC = () => {
  const [reputationData, setReputationData] = useState<Reputation | null>(null);

  useEffect(() => {
    const history = listReputationEvents();
    // Provide a default profile if we have history or just to show the UI
    setReputationData({
      score: 4.5,
      level: 'Expert',
      history,
    });
  }, []);

  return (
    <ReputationPageClient
      reputationData={reputationData}
    />
  );
};

export default ReputationPage;
