'use client';

import { mentorPricesUpdateSchema } from '@devmentor/core/validators/mentors/mentor-prices-update.schema';
import { Badge, Button, Card } from '@devmentor/ui';
import { CrudForm, ErrorMessage, ResourcePanel, useApiResource } from '@devmentor/ui/backend';
import { useState } from 'react';

interface PriceBounds {
  minCents: number;
  maxCents: number;
}

export interface MentorPricesResource {
  prices?: { price25Cents: number; price50Cents: number; currency: string } | null;
  priceCurrency?: string;
  priceBounds?: { p25: PriceBounds; p50: PriceBounds };
}

function decimalAmount(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function boundLabel(currency: string, bounds: PriceBounds): string {
  return `${currency} ${decimalAmount(bounds.minCents)} to ${currency} ${decimalAmount(bounds.maxCents)}`;
}

export function MentorPricesClient() {
  const resource = useApiResource<MentorPricesResource>('/api/mentors/me');
  const [saved, setSaved] = useState(false);

  return <ResourcePanel resource={resource} loadingMessage="Loading your session prices…">
    {(profile) => {
      if (profile.priceCurrency === undefined || profile.priceBounds === undefined) {
        return <Card className="dm-product-panel">
          <ErrorMessage message="Price settings are unavailable. Try again." />
          <div className="dm-product-actions">
            <Button type="button" variant="outline" onClick={resource.reload}>Try again</Button>
          </div>
        </Card>;
      }

      const { priceCurrency, priceBounds, prices } = profile;
      return <Card className="dm-product-panel">
        <div>
          <h2 className="dm-product-heading">Your session prices</h2>
          <p className="dm-product-muted">
            Enter decimal amounts in the fixed platform currency. Both values change in one save.
          </p>
          <div className="dm-fact-chips" role="group" aria-label="Allowed session prices">
            <Badge variant="outline">25 minutes: {boundLabel(priceCurrency, priceBounds.p25)}</Badge>
            <Badge variant="outline">50 minutes: {boundLabel(priceCurrency, priceBounds.p50)}</Badge>
          </div>
        </div>
        <CrudForm
          key={`${prices?.price25Cents ?? 'unset'}:${prices?.price50Cents ?? 'unset'}`}
          schema={mentorPricesUpdateSchema}
          fields={[
            {
              name: 'price25',
              label: '25-minute price',
              type: 'money',
              currency: priceCurrency,
              required: true,
              description: `Allowed range: ${boundLabel(priceCurrency, priceBounds.p25)}.`,
            },
            {
              name: 'price50',
              label: '50-minute price',
              type: 'money',
              currency: priceCurrency,
              required: true,
              description: `Allowed range: ${boundLabel(priceCurrency, priceBounds.p50)}.`,
            },
          ]}
          endpoint="/api/mentors/me/prices"
          method="PUT"
          initialValues={{
            price25: prices ? decimalAmount(prices.price25Cents) : '',
            price50: prices ? decimalAmount(prices.price50Cents) : '',
          }}
          submitLabel="Save prices"
          onSuccess={() => {
            setSaved(true);
            resource.reload();
          }}
        />
        {saved ? <p role="status">Session prices saved.</p> : null}
      </Card>;
    }}
  </ResourcePanel>;
}
