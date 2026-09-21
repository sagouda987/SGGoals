export type McpErrorCode =
  | 'INVALID_DATE'
  | 'UNAUTHORIZED'
  | 'TASK_NOT_FOUND'
  | 'INVALID_CATEGORY'
  | 'DATA_NOT_AVAILABLE'
  | 'INTERNAL_ERROR';

export class SgGoalsMcpError extends Error {
  constructor(public readonly code: McpErrorCode, message: string) {
    super(message);
    this.name = 'SgGoalsMcpError';
  }
}

export function controlledError(error: unknown) {
  if (error instanceof SgGoalsMcpError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR' as const, message: 'SG Goals data could not be read.' };
}
