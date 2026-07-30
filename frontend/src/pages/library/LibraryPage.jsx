import { useState } from 'react';
import { cn } from '../../lib/cn';
import DestinationsTab from './DestinationsTab';
import DayTemplatesTab from './DayTemplatesTab';
import HotelsTab from './HotelsTab';

const TABS = [
  { key: 'destinations', label: 'Destinations' },
  { key: 'day-templates', label: 'Day Templates' },
  { key: 'hotels', label: 'Hotels' },
];

function LibraryPage() {
  const [tab, setTab] = useState('destinations');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Data Library</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage the destinations, itinerary days, and hotels the package builder draws from.
        </p>
      </div>

      <div className="flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'day-templates' && <DayTemplatesTab />}
      {tab === 'hotels' && <HotelsTab />}
    </div>
  );
}

export default LibraryPage;
