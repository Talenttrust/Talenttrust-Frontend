import type { Reputation, ReputationEvent } from '@/types/domain';

export async function endorseUser(
  currentReputation: Reputation | null | undefined,
  shouldFail = false
): Promise<Reputation> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (shouldFail) {
    throw new Error('Failed to endorse user due to network error.');
  }

  const score = (currentReputation?.score ?? 0) + 1;
  const history = currentReputation?.history ? [...currentReputation.history] : [];
  
  const newEvent: ReputationEvent = {
    id: `event-${Date.now()}`,
    type: 'Endorsement',
    summary: 'Received an endorsement from a community member.',
    date: new Date().toISOString().split('T')[0],
  };

  history.unshift(newEvent); // Add to the top of the history

  return {
    ...currentReputation,
    score,
    history,
  };
}
