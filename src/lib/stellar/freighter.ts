import { getAddress as getFreighterAddress, isConnected } from '@stellar/freighter-api';

export async function getAddress(): Promise<string> {
  const connection = await isConnected();
  if (connection.error) {
    throw new Error('Could not check the Freighter connection.');
  }
  if (!connection.isConnected) {
    throw new Error('Connect Freighter to check arbiter access.');
  }

  const result = await getFreighterAddress();
  if (result.error || !result.address) {
    throw new Error('Could not read the connected Freighter address.');
  }

  return result.address;
}
