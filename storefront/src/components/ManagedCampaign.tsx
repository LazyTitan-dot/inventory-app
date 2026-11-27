import * as React from 'react';
import type { Campaign } from '../data/commercial/campaigns';
export function ManagedHero({
  campaign,
  mobile,
  open,
}: {
  campaign: Campaign;
  mobile: boolean;
  open: () => void;
}) {
  return (
    <>
      <div className={mobile ? 'mobile-hero-copy' : 'desktop-hero-copy'}>
        <h2>{campaign.title}</h2>
        <p>{campaign.subtitle}</p>
        <div className="hero-actions">
          <button className="actionprimary" type="button" onClick={open}>
            {campaign.target ? 'Ver producto' : 'Ver catálogo'}
          </button>
        </div>
      </div>
      {campaign.asset &&
        (mobile ? (
          <img className="hero-image" src={campaign.asset} alt="" />
        ) : (
          <div className="desktop-hero-art">
            <img src={campaign.asset} alt="" />
          </div>
        ))}
    </>
  );
}
export function ManagedStrip({ campaign, open }: { campaign: Campaign; open: () => void }) {
  return (
    <div className="shipping-banner">
      <div className="shipping-copy">
        <h2>{campaign.title}</h2>
        <p>{campaign.subtitle || campaign.code}</p>
        <button className="actionsecondary" type="button" onClick={open}>
          {campaign.target ? 'Ver producto' : 'Ver catálogo'}
        </button>
      </div>
      {campaign.asset && <img className="shipping-fleet" src={campaign.asset} alt="" />}
    </div>
  );
}
