import { endorseUser } from '../reputationService';
import type { Reputation } from '@/types/domain';

describe('reputationService', () => {
  it('increases score and prepends history on success', async () => {
    const current: Reputation = { score: 10, history: [] };
    const result = await endorseUser(current);
    
    expect(result.score).toBe(11);
    expect(result.history?.length).toBe(1);
    expect(result.history![0].type).toBe('Endorsement');
  });

  it('handles null currentReputation gracefully', async () => {
    const result = await endorseUser(null);
    
    expect(result.score).toBe(1);
    expect(result.history?.length).toBe(1);
  });

  it('throws an error if shouldFail is true', async () => {
    await expect(endorseUser(null, true)).rejects.toThrow('Failed to endorse user due to network error.');
  });
});
