import { createContext } from 'react';
import { projectCampaigns, type Campaigns } from './content';
export type { Campaign, Campaigns } from './content';
export const CampaignContext = createContext<
  (Campaigns & { variant: (slug: string) => string | undefined }) | null
>(null);
export async function readCampaigns(): Promise<Campaigns> {
  const response = await fetch('/api/catalog/v1/content', {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Contenido comercial no disponible');
  return projectCampaigns(await response.json());
}
