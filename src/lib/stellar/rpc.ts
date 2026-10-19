import { site } from '@/lib/site';

const RPC_TIMEOUT_MS = 10_000;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type ScValResult = boolean | number | bigint | string | Uint8Array | null;

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface SimulationResult {
  results?: Array<{ xdr?: string }>;
  error?: string;
}

class XdrWriter {
  private readonly bytes: number[] = [];

  i32(value: number) {
    pushU32(this.bytes, value);
  }

  u32(value: number) {
    pushU32(this.bytes, value);
  }

  u64(value: bigint | number) {
    const big = BigInt.asIntN(64, BigInt(value));
    for (let shift = 56n; shift >= 0n; shift -= 8n) {
      this.bytes.push(Number((big >> shift) & 0xffn));
    }
  }

  bool(value: boolean) {
    this.u32(value ? 1 : 0);
  }

  fixed(value: Uint8Array) {
    for (const byte of value) this.bytes.push(byte);
  }

  opaque(value: Uint8Array) {
    this.u32(value.length);
    this.fixed(value);
    this.pad(value.length);
  }

  string(value: string) {
    this.opaque(new TextEncoder().encode(value));
  }

  private pad(length: number) {
    const remainder = length % 4;
    if (remainder === 0) return;
    for (let i = remainder; i < 4; i += 1) this.bytes.push(0);
  }

  toBase64() {
    return toBase64(new Uint8Array(this.bytes));
  }
}

function pushU32(target: number[], value: number) {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function decodeContractId(contractId: string): Uint8Array {
  const value = contractId.trim().toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let buffer = 0;
  const decoded: number[] = [];

  for (const character of value) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new Error('Invalid contract ID');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded.push((buffer >>> bits) & 0xff);
    }
  }

  if (decoded.length !== 35) throw new Error('Invalid contract ID');
  return new Uint8Array(decoded.slice(1, 33));
}

function encodeContractAddress(writer: XdrWriter) {
  writer.i32(1);
  writer.fixed(decodeContractId(site.contractId));
}

function buildInvokeTransaction(functionName: string, args: Array<(writer: XdrWriter) => void>) {
  const writer = new XdrWriter();

  writer.i32(2);
  writer.i32(0);
  writer.fixed(new Uint8Array(32));
  writer.u32(100);
  writer.u64(0);
  writer.i32(0);
  writer.i32(0);

  writer.u32(1);
  writer.bool(false);
  writer.i32(24);
  writer.i32(0);
  encodeContractAddress(writer);
  writer.string(functionName);
  writer.u32(args.length);
  for (const arg of args) arg(writer);
  writer.u32(0);
  writer.i32(0);
  writer.u32(0);

  return writer.toBase64();
}

function decodeScVal(bytes: Uint8Array): ScValResult {
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = () => {
    const value = view.getUint32(offset);
    offset += 4;
    return value;
  };
  const i32 = () => {
    const value = view.getInt32(offset);
    offset += 4;
    return value;
  };
  const opaque = () => {
    const length = u32();
    const value = bytes.slice(offset, offset + length);
    offset += length;
    const remainder = length % 4;
    if (remainder !== 0) offset += 4 - remainder;
    return value;
  };
  const text = () => new TextDecoder().decode(opaque());

  const type = i32();
  switch (type) {
    case 0:
      return i32() !== 0;
    case 1:
      return null;
    case 3:
      return u32();
    case 4:
      return i32();
    case 5: {
      const value = view.getBigUint64(offset);
      offset += 8;
      return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
    case 6: {
      const value = view.getBigInt64(offset);
      offset += 8;
      return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(value)
        : value;
    }
    case 13:
      return opaque();
    case 14:
    case 15:
      return text();
    default:
      throw new Error(`Unsupported contract response type (${type})`);
  }
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function simulateContractCall(functionName: string): Promise<ScValResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(site.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'talenttrust-contract-status',
        method: 'simulateTransaction',
        params: { transaction: buildInvokeTransaction(functionName, []) },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Soroban RPC request failed (${response.status})`);

    const payload = (await response.json()) as JsonRpcResponse<SimulationResult>;
    if (payload.error) throw new Error(payload.error.message || 'Soroban RPC request failed');
    if (payload.result?.error) throw new Error(payload.result.error);

    const encoded = payload.result?.results?.[0]?.xdr;
    if (!encoded) throw new Error('Soroban RPC returned no simulation result');

    return decodeScVal(fromBase64(encoded));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Soroban RPC request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
