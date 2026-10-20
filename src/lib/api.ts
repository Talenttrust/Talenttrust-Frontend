import { z, type ZodSchema } from 'zod';
import { site } from './site';
import {
  ApiErrorBodySchema,
  ChainSchema,
  ContractListSchema,
  DisputeSchema,
  EscowContractSchema,
  MilestoneSchema,
  ReputationSchema,
  StatsSchema,
} from './schemas';

export type Milestone = z.infer<typeof MilestoneSchema>;
export type Dispute = z.infer<typeof DisputeSchema>;
export type EscrowContract = z.infer<typeof EscrowContractSchema>;
export type ContractList = z.infer<typeof ContractListSchema>;
export type Reputation = z.infer<typeof ReputationSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Chain = z.infer<typeof ChainSchema>;

export class ApiSchemaError extends Error {
  readonly path: string;
  readonly issues: string[];

  constructor(path: string, issues: string[]) {
    super(`API response for ${path} did not match the expected schema`);
    this.name = 'ApiSchemaError';
    this.path = path;
    this.issues = issues;
  }
}

function condenseIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 3).map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${location}: ${issue.message}`;
  });
}

function isJsonContentType(res: Response): boolean {
  const contentType = res.headers.get('content-type') ?? '';
  return /\bapplication\/(?:[\w.-+]+\+)?json\b/i.test(contentType);
}

export async function api<Schema extends ZodSchema<any>>(
  path: string,
  schema: Schema,
  init?: { method?: string; body?: unknown },
): Promise<z.infer<Schema>> {
  const res = await fetch(`${site.apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const errorBody = ApiErrorBodySchema.safeParse(parsed);
    const message = errorBody.success ? errorBody.data.message : `Request failed (${res.status})`;
    throw new Error(message);
  }

  if (text.length === 0 || parsed === undefined) {
    throw new ApiSchemaError(path, ['Response body was not valid JSON']);
  }

  if (!isJsonContentType(res)) {
    throw new ApiSchemaError(path, [`Unexpected content-type: ${res.headers.get('content-type') ?? '(missing)'}`]);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiSchemaError(path, condenseIssues(result.error));
  }

  return result.data as z.infer<Schema>;
}
