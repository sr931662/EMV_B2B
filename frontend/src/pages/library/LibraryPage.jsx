import { useMemo, useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import DestinationsTab from './DestinationsTab';
import DayTemplatesTab from './DayTemplatesTab';
import HotelsTab from './HotelsTab';
import PackagesTab from './PackagesTab';
import LibraryShellPage from '../admin/LibraryShellPage';
import AdminVisaConfigPage from '../admin/AdminVisaConfigPage';

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
  // Same reasoning: Inclusions, Exclusions and Tags are the three package-builder pickers most
  // often reached for, but they were only findable via Master data → Vocabulary item → a "type"
  // dropdown — a path nobody stumbles onto by accident. All three are `lookup` rows under the
  // hood (Tags via the PACKAGE_TAG vocabulary), same as everything still under Master data; they
  // just get a tab of their own because that is how someone building a package thinks of them.
  { key: 'inclusions', label: 'Inclusions', icon: 'check-circle' },
  { key: 'exclusions', label: 'Exclusions', icon: 'x-circle' },
  { key: 'tags', label: 'Tags', icon: 'star' },
  { key: 'master-data', label: 'Master data', icon: 'layers' },
];

function LibraryPage() {
  const [tab, setTab] = useState('destinations');
  const { user } = useAuth();

  // Packages carry raw wholesale pricing (Package.adultRawPrice/childRawPrice, the EMV quote
  // PDF). roles.js is explicit that data_feeder has no package access "not even read" — the
  // intern role is scoped
  // to the library only. The Packages tab is therefore admin-only, unlike every other tab here,
  // which every library-capable role can browse.
  const isAdmin = user?.role === 'admin';
  // Visa products/countries carry the same wholesale pricing sensitivity as packages — they run
  // under CAN_READ_VISA_CONFIG/CAN_WRITE_VISA_CONFIG (admin+partner read, admin write), a
  // DELIBERATELY narrower boundary than this page's own CAN_READ_LIBRARY/CAN_WRITE_LIBRARY (which
  // include data_feeder). Embedding AdminVisaConfigPage's own component here does not change that
  // boundary at all — its own routes still enforce it — but the TAB itself is admin-only so a
  // data_feeder never even sees it exists, same reasoning as the Packages tab beside it.
  const tabs = useMemo(() => {
    if (!isAdmin) return BASE_TABS;

    const insertAt = BASE_TABS.findIndex((t) => t.key === 'master-data');
    return [
      ...BASE_TABS.slice(0, insertAt),
      { key: 'packages', label: 'Packages', icon: 'package' },
      { key: 'visa-products', label: 'Visa Products', icon: 'plane' },
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
      {tab === 'visa-products' && isAdmin && <AdminVisaConfigPage embedded />}
      {tab === 'documents' && <LibraryShellPage embedded fixedEntity="documentType" />}
      {tab === 'inclusions' && (
        <LibraryShellPage embedded fixedEntity="lookup" fixedLookupType="INCLUSION" itemLabel="Inclusion" />
      )}
      {tab === 'exclusions' && (
        <LibraryShellPage embedded fixedEntity="lookup" fixedLookupType="EXCLUSION" itemLabel="Exclusion" />
      )}
      {tab === 'tags' && (
        <LibraryShellPage embedded fixedEntity="lookup" fixedLookupType="PACKAGE_TAG" itemLabel="Tag" />
      )}
      {tab === 'master-data' && <LibraryShellPage embedded />}
    </div>
  );
}

export default LibraryPage;
