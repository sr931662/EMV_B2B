import { useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui';
import DestinationsTab from './DestinationsTab';
import DayTemplatesTab from './DayTemplatesTab';
import HotelsTab from './HotelsTab';

const TABS = [
  { key: 'destinations', label: 'Destinations', icon: 'map-pin' },
  { key: 'day-templates', label: 'Day Templates', icon: 'calendar' },
  { key: 'hotels', label: 'Hotels', icon: 'building' },
];

function LibraryPage() {
  const [tab, setTab] = useState('destinations');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Data Library"
        subtitle="The destinations, itinerary days and hotels the package builder draws from. Packages copy from these, so editing one here never changes a published package."
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'day-templates' && <DayTemplatesTab />}
      {tab === 'hotels' && <HotelsTab />}
    </div>
  );
}

export default LibraryPage;
