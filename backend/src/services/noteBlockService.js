const prisma = require('../utils/prisma');

/**
 * Company-wide prose — terms, scope of services, cancellation wording.
 *
 * Formerly `ContentBlock`, and still the same table (see the @@map in schema.prisma). What is new is
 * that the blocks a document DEPENDS ON are now declared here rather than being an array halfway
 * down voucherService.
 *
 * That matters because of how the old arrangement failed: voucherService looks its blocks up by key
 * and omits any it cannot find. The table has always been empty, so every voucher ever printed has
 * silently carried no terms and conditions at all — no error, no warning, nothing in a log. A
 * document that quietly drops its legal footer is worse than one that fails to render.
 *
 * `missingRequired()` turns that into something the library can show.
 */

/**
 * Blocks the voucher prints at its foot, in the order it prints them.
 *
 * Keys are stable forever — they are what the document looks up. The titles are the suggested
 * heading, used only when creating the stub; an admin may rewrite it.
 */
const REQUIRED_VOUCHER_BLOCKS = [
  { key: 'TERMS_AND_CONDITIONS', title: 'Terms and Conditions', type: 'TERMS_AND_CONDITIONS' },
  { key: 'SCOPE_OF_SERVICES', title: 'Scope of Services', type: 'SCOPE_OF_SERVICES' },
  {
    key: 'HOTEL_AND_LAND_CANCELLATION_POLICY',
    title: 'Hotel and Land Cancellation Policy',
    type: 'CANCELLATION_POLICY_TEXT',
  },
  {
    key: 'AMENDMENT_OF_BOOKING_BY_GUEST',
    title: 'Amendment of Booking by Guest',
    type: 'AMENDMENT_POLICY',
  },
  { key: 'GENERAL_NOTES', title: 'General Notes', type: 'GENERAL_NOTE' },
];

const REQUIRED_KEYS = REQUIRED_VOUCHER_BLOCKS.map((b) => b.key);

/** The blocks a voucher will print, in declared order. Missing ones are simply absent. */
async function forVoucher(client = prisma) {
  const blocks = await client.noteBlock.findMany({
    where: { key: { in: REQUIRED_KEYS }, archived: false },
    select: { key: true, title: true, body: true, type: true },
  });

  // Declared order, not whatever the database returned, so the printed page reads the same way
  // every time.
  return REQUIRED_KEYS.map((key) => blocks.find((b) => b.key === key)).filter(Boolean);
}

/**
 * Which required blocks are missing or empty.
 *
 * A block whose body is blank counts as missing: it would print a heading with nothing under it,
 * which looks like a rendering bug and reads worse than omitting the section.
 */
async function missingRequired(client = prisma) {
  const existing = await client.noteBlock.findMany({
    where: { key: { in: REQUIRED_KEYS }, archived: false },
    select: { key: true, body: true },
  });

  const written = new Set(
    existing.filter((b) => String(b.body ?? '').trim() !== '').map((b) => b.key)
  );

  return REQUIRED_VOUCHER_BLOCKS.filter((b) => !written.has(b.key));
}

/**
 * Creates empty stubs for any required block that does not exist yet.
 *
 * Deliberately does NOT invent wording. Placeholder legal text is the one kind of seed data that can
 * do real damage — it would print to a customer looking exactly as authoritative as the real thing.
 * The stub gives the admin the right key and heading and an empty body, and `missingRequired` keeps
 * reporting it until someone writes it.
 */
async function ensureStubs({ user } = {}) {
  const missing = await missingRequired();
  const created = [];

  for (const block of missing) {
    const existing = await prisma.noteBlock.findUnique({ where: { key: block.key } });

    if (existing) continue;

    created.push(
      await prisma.noteBlock.create({
        data: {
          key: block.key,
          title: block.title,
          type: block.type,
          body: '',
          isGlobal: true,
          searchText: block.title.toLowerCase(),
        },
      })
    );
  }

  return { created, stillMissing: await missingRequired() };
}

module.exports = { REQUIRED_VOUCHER_BLOCKS, REQUIRED_KEYS, forVoucher, missingRequired, ensureStubs };
