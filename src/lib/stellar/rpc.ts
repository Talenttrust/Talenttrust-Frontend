import { Contract, Networks, rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { site } from '@/lib/site';
import { getAddress } from './freighter';

const rpcUrls: Record<string, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  public: 'https://mainnet.sorobanrpc.com',
};

function getNetworkPassphrase(): string {
  if (site.network === 'testnet') return Networks.TESTNET;
  if (site.network === 'public') return Networks.PUBLIC;
  throw new Error(`Unsupported Stellar network: ${site.network}`);
}

export async function simulateRead(method: string, args: xdr.ScVal[] = []): Promise<xdr.ScVal> {
  const url = rpcUrls[site.network];
  if (!url) throw new Error(`Unsupported Stellar network: ${site.network}`);

  const server = new rpc.Server(url);
  const source = await server.getAccount(await getAddress());
  const transaction = new TransactionBuilder(source, {
    fee: '100000',
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(new Contract(site.contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  const value = simulation.result?.retval;
  if (!value) {
    throw new Error(`The ${method} simulation returned no value.`);
  }

  return value;
}
