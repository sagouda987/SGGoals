import type { Metadata } from 'next';
import { SgGoalsApp } from '@/components/goals/sg-goals-app';

export const metadata: Metadata = {
  title: 'SG Goals | Persistent Task Tracker',
  description: 'A personal goals tracker with browser-persisted tasks.'
};

export default function GoalsPage() {
  return <SgGoalsApp />;
}
