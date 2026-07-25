'use client';

import React, { useOptimistic, useTransition } from 'react';
import EmptyState from '../../components/EmptyState';
import ReputationProfile from '../../components/ReputationProfile';
import type { Reputation, ReputationEvent } from '@/types/domain';
import { endorseUser } from '@/lib/reputationService';
import { useToast } from '@/components/toast/toast-provider';

export type ReputationPageContentProps = {
  reputationData?: Reputation | null;
  userName?: string;
};

export function ReputationPageContent({
  reputationData,
  userName = 'User',
}: ReputationPageContentProps) {
  const [optimisticReputation, addOptimisticEndorsement] = useOptimistic<
    Reputation | null | undefined,
    ReputationEvent
  >(reputationData, (state, newEvent) => {
    if (!state) return state;
    return {
      ...state,
      score: (state.score ?? 0) + 1,
      history: [newEvent, ...(state.history || [])],
    };
  });

  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useToast();

  const score = optimisticReputation?.score;
  const hasReputation = typeof score === 'number' && score >= 0;

  const handleEndorse = () => {
    const newEvent: ReputationEvent = {
      id: `optimistic-${Date.now()}`,
      type: 'Endorsement',
      summary: 'Received an endorsement from a community member.',
      date: new Date().toISOString().split('T')[0],
    };

    startTransition(async () => {
      addOptimisticEndorsement(newEvent);
      try {
        await endorseUser(reputationData, false); // For manual testing you could set this to true
        showSuccess({ title: 'Success', description: 'User endorsed successfully.' });
      } catch (err) {
        showError({ title: 'Endorsement failed', description: 'Could not submit endorsement.' });
      }
    });
  };

  if (!optimisticReputation || !hasReputation) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-2xl font-bold mb-6">Reputation</h1>
        <EmptyState
          illustration="reputation"
          title="No reputation yet"
          description="Your reputation will be built as you complete contracts and receive feedback from clients. Start by creating and fulfilling your first contract."
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Reputation</h1>
      <ReputationProfile
        name={userName}
        score={score}
        level={optimisticReputation.level}
        history={optimisticReputation.history}
        onEndorse={handleEndorse}
        isEndorsing={isPending}
      />
    </main>
  );
}

const ReputationPage: React.FC = () => {
  // Use a default reputation item to allow testing the UI locally
  const [reputation, setReputation] = React.useState<Reputation[]>([
    {
      score: 4,
      level: 'Trusted Partner',
      history: [
        {
          id: 'initial-1',
          type: 'Verification',
          summary: 'Completed identity verification',
          date: new Date().toISOString().split('T')[0],
        }
      ],
    }
  ]);

  return (
    <ReputationPageContent
      reputationData={reputation.length > 0 ? reputation[0] : null}
    />
  );
};

export default ReputationPage;
