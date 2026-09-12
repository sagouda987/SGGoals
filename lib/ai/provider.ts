import type { AIContext } from '@/lib/ai/context-builder';

export interface AIProvider {
  readonly name: string;
  recommendNextAction(context: AIContext): Promise<unknown>;
}
