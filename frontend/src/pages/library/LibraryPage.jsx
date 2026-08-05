import { useMemo, useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import DestinationsTab from './DestinationsTab';
import DayTemplatesTab from './DayTemplatesTab';
import HotelsTab from './HotelsTab';
import PackagesTab from './PackagesTab';
import LibraryShellPage from '../admin/LibraryShellPage';

/**
 * The Library — the master data every other module reads from.
 *
 * ONE screen, deliberately. The three tabs on the left are entities rich enough to need a builder of
 * their own: a destination has images and markdown, a day template is a sequence of events, a hotel
 * carries supplier contracts and a rate card. Everything else is maintained through the generic
 * browser on the "Master data" tab, which builds itself from the server's registry — so a new
 * library section appears here the moment it is registered, with no screen to write.
 *
 * The split is declared on the server (`dedicatedScreen` in libraryRegistry) rather than hardcoded
 * here, which is what stops an entity showing up twice behind two different editors.
 *
 * Packages sit alongside the source data rather than off in Admin → Operations, because a package
 * is the thing every other tab here ultimately proves itself against — its itinerary is day
 * templates, its hotels are copied from the Hotels tab, its policy and FAQs are picked from master
 * data. The full builder still lives on its own screen (linked from the Packages tab) for the same
 * reason a hotel's rate card does — some things are too big to be a form on this page.
 */

const BASE_TABS = [
  { key: 'destinations', label: 'Destinations', icon: 'map-pin' },
  { key: 'day-templates', label: 'Day Templates', icon: 'calendar' },
  { key: 'hotels', label: 'Hotels', icon: 'building' },
  // Document types (passport, photo, financial…) were previously reachable only by opening
  // "Master data" and picking one of ten segments — easy to miss entirely. Broken out as its own
  // top-level tab since it is what a checklist requirement actually points at, distinct from a
  // visa product's own checklist/timeline editor at /admin/visa-config.
  { key: 'documents', label: 'Documents', icon: 'file' },
  { key: 'master-data', label: 'Master data', icon: 'layers' },
];

function LibraryPage() {
  const [tab, setTab] = useState('destinations');
  const { user } = useAuth();

  // Packages carry raw wholesale pricing (Package.rawPrice, the EMV quote PDF). roles.js is
  // explicit that data_feeder has no package access "not even read" — the intern role is scoped
  // to the library only. The Packages tab is therefore admin-only, unlike every other tab here,
  // which every library-capable role can browse.
  const isAdmin = user?.role === 'admin';
  const tabs = useMemo(() => {
    if (!isAdmin) return BASE_TABS;

    const insertAt = BASE_TABS.findIndex((t) => t.key === 'master-data');
    return [
      ...BASE_TABS.slice(0, insertAt),
      { key: 'packages', label: 'Packages', icon: 'package' },
      ...BASE_TABS.slice(insertAt),
    ];
  }, [isAdmin]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Library"
        subtitle="Master data for the whole system — countries, destinations, hotels and their rates, suppliers, activities, vocabulary, documents, policies and reusable content. Packages copy from here at build time, and quotes freeze their own copy, so editing anything here changes what is built next, never what a customer has already been sent."
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'day-templates' && <DayTemplatesTab />}
      {tab === 'hotels' && <HotelsTab />}
      {tab === 'packages' && isAdmin && <PackagesTab />}
      {tab === 'documents' && <LibraryShellPage embedded fixedEntity="documentType" />}
      {tab === 'master-data' && <LibraryShellPage embedded />}
    </div>
  );
}

export default LibraryPage;
