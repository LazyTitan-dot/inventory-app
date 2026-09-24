import { createContext } from 'react';
import type { RetailData } from '../lib/contracts';

export interface RetailContextValue {
  data: RetailData;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  refreshing: boolean;
  lastUpdated: Date;
}
export const RetailContext = createContext<RetailContextValue | null>(null);
