const ExcelJS = require('exceljs');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const registry = require('./libraryRegistry');
const libraryService = require('./libraryService');
const auditService = require('./auditService');
const destinationService = require('./destinationService');
const hotelService = require('./hotelService');
const dayTemplateService = require('./dayTemplateService');

/**
 * Excel bulk import/export for the Library.
 *
 * The registry-driven entities (vocabulary, currency, country, document types, FAQs, note blocks,
 * cancellation policies, insurance plans, vendors, activities) go through `exportEntity`/
 * `importEntity`, layered ON TOP of libraryService.create/update rather than writing Prisma
 * directly. That is not a style choice — it is what keeps a bulk import inside the exact same
 * boundary as every other write in this system: the field whitelist (a column this file does not
 * know about is simply not writable), the commercial-field strip (a data_feeder's spreadsheet
 * cannot smuggle in a price any more than the form can), and the audit trail (a bulk-imported row
 * has the same CREATE/UPDATE history as one typed in by hand).
 *
 * Destinations, hotels and day templates are NOT registry-generic — each has its own dedicated
 * screen backed by a dedicated service (destinationService/hotelService/dayTemplateService) that
 * carries real business logic the generic path does not know about: case-insensitive dedup,
 * auto-restore of an archived row with the same name, country-name resolution and auto-creation
 * for destinations, and the active-parent guard for hotels/day templates. Routing their bulk
 * import through the generic `libraryService.create` (a raw Prisma write) would silently skip all
 * of that. So each gets its own bespoke export/import pair below that calls the real service
 * functions — the same shape as importHotelRates already does for rate cards, extended to the
 * entity's own fields instead of a child collection. Packages and visa products stay out of bulk
 * import entirely — they are built through a decision process (itinerary, pricing, checklist), not
 * a row of columns, and the risk of a bad spreadsheet corrupting wholesale pricing or itinerary
 * data is not worth the convenience.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function bulkConfigFor(entity) {
  const config = registry.get(entity);

  if (!config) {
    throw ApiError.badRequest(`Unknown library entity "${entity}". Valid values: ${registry.names().join(', ')}`);
  }
  if (config.readOnly || config.writeThrough || config.dedicatedScreen) {
    throw ApiError.badRequest(
      `${config.label} is maintained on its own screen and does not support bulk import/export.`
    );
  }
  if (!config.fields || config.fields.length === 0) {
    throw ApiError.badRequest(`${config.label} has no bulk-editable fields.`);
  }

  return config;
}

/** Fields a given user is allowed to SEE in a sheet — mirrors what they are allowed to WRITE. */
function visibleFieldsFor(config, user) {
  const isAdmin = user?.role === 'admin';

  return config.fields.filter((f) => isAdmin || !config.commercialFields?.includes(f.name));
}

const PICKER_REF_PREFIX = 'ref__';

function referenceColumnKey(fieldName) {
  return `${PICKER_REF_PREFIX}${fieldName}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** One export per picker field: id -> display name, fetched once rather than per row. */
async function buildPickerLookups(fields, rows) {
  const lookups = {};

  for (const f of fields.filter((field) => field.type === 'picker')) {
    const refConfig = registry.get(f.entity);
    if (!refConfig) continue;

    const refIdField = refConfig.idField ?? 'id';
    const ids = [...new Set(rows.map((r) => r[f.name]).filter((v) => v !== null && v !== undefined))];

    if (ids.length === 0) {
      lookups[f.name] = new Map();
      continue;
    }

    const refRows = await prisma[refConfig.model].findMany({
      where: { [refIdField]: { in: ids } },
      select: { [refIdField]: true, name: true },
    });

    lookups[f.name] = new Map(refRows.map((r) => [r[refIdField], r.name]));
  }

  return lookups;
}

function cellValueOut(field, value) {
  if (value === null || value === undefined) return '';
  if (field.type === 'tags') return Array.isArray(value) ? value.join(', ') : String(value);
  if (field.type === 'boolean') return Boolean(value);
  if (field.type === 'number') return value === '' ? '' : Number(value);
  // Decimal fields arrive from Prisma as Decimal objects; everything else is already primitive.
  return typeof value === 'object' && value !== null && typeof value.toNumber === 'function'
    ? value.toNumber()
    : String(value);
}

function fieldGuideNote(field) {
  if (field.type === 'select') return `One of: ${(field.options ?? []).join(', ')}`;
  if (field.type === 'tags') return field.numeric ? 'Comma-separated numbers' : 'Comma-separated values';
  if (field.type === 'boolean') return 'TRUE or FALSE';
  if (field.type === 'picker') {
    return `Type the ${registry.get(field.entity)?.label ?? field.entity}'s name (or its id). The column ` +
      'next to it shows the current name for reference and is not read back in.';
  }
  return field.hint ?? '';
}

/**
 * Builds an .xlsx workbook: one sheet of data, one sheet explaining every column.
 *
 * The export doubles as the import template on purpose — download it, edit it in place (add rows,
 * change values), upload the same file. That is the whole workflow, and it only holds together if
 * the column headers this function writes are the exact ones importEntity reads back.
 */
async function exportEntity(entity, { includeArchived = false, type, user } = {}) {
  const config = bulkConfigFor(entity);
  const idField = config.idField ?? 'id';
  const fields = visibleFieldsFor(config, user);

  if (config.requiredFilter === 'type' && !type) {
    throw ApiError.badRequest(`${config.label} export requires a "type"`);
  }

  const where = {};
  if (!includeArchived) where.archived = false;
  if (config.requiredFilter === 'type') where.type = type;

  const rows = await prisma[config.model].findMany({ where, orderBy: config.defaultOrder });
  const pickerLookups = await buildPickerLookups(fields, rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TravNexa Global Library';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(config.label.slice(0, 31));

  const columns = [{ header: 'id', key: 'id', width: 26 }];
  fields.forEach((f) => {
    columns.push({ header: f.label, key: f.name, width: Math.min(Math.max(f.label.length + 4, 14), 42) });
    if (f.type === 'picker') {
      columns.push({ header: `${f.label} — current value`, key: referenceColumnKey(f.name), width: 28 });
    }
  });
  columns.push({ header: 'archived', key: 'archived', width: 10 });
  sheet.columns = columns;

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((row) => {
    const record = { id: row[idField], archived: row.archived };

    fields.forEach((f) => {
      record[f.name] = cellValueOut(f, row[f.name]);
      if (f.type === 'picker') {
        record[referenceColumnKey(f.name)] = pickerLookups[f.name]?.get(row[f.name]) ?? '';
      }
    });

    sheet.addRow(record);
  });

  const guide = workbook.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Column', key: 'col', width: 30 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Notes', key: 'notes', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({
    col: 'id',
    type: 'reference',
    notes: 'Leave blank on a new row to create it. Filled in, it must match an existing row to update it.',
  });
  fields.forEach((f) => {
    guide.addRow({ col: f.label, type: f.type, notes: fieldGuideNote(f) + (f.required ? ' (required)' : '') });
  });
  guide.addRow({
    col: 'archived',
    type: 'boolean',
    notes: 'Read only on export. Archiving/restoring through this file is not supported — use the Library.',
  });
  guide.addRow({ col: '', type: '', notes: '' });
  guide.addRow({
    col: 'How matching works',
    type: '',
    notes:
      `A row updates an existing ${config.label.toLowerCase()} when its "id" matches one, or — if id ` +
      `is blank — when its "${config.naturalKey ?? 'name'}" matches one. Otherwise a new row is created. ` +
      'A blank cell in any other column leaves that field unchanged; there is no way to clear a field ' +
      'through import.',
  });

  return { buffer: await workbook.xlsx.writeBuffer(), filename: `${entity}-export.xlsx` };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function rawCellValue(cell) {
  const v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) return v.result; // formula cell
  if (v && typeof v === 'object' && 'text' in v) return v.text; // rich text cell
  return v;
}

function cellValueIn(field, raw) {
  if (raw === null || raw === undefined || raw === '') return undefined; // "leave unchanged"

  if (field.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    return ['true', 'yes', '1'].includes(String(raw).trim().toLowerCase());
  }
  if (field.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.type === 'tags') {
    const parts = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return field.numeric ? parts.map(Number).filter((n) => Number.isFinite(n)) : parts;
  }

  return String(raw).trim();
}

/**
 * Reduces a raw Prisma error to one plain sentence for the per-row error report.
 *
 * Prisma's own error text is a multi-line diagnostic with file paths and a source-code snippet —
 * exactly what you want in a server log, and exactly what nobody fixing a spreadsheet needs to see.
 * The required-field case is already caught before this runs (see importEntity); this is the
 * fallback for everything else Prisma can still reject a row for — a unique constraint, a bad
 * relation id that slipped past resolvePickerCell, and so on.
 */
function cleanErrorMessage(error) {
  if (error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'a field';
    return `${target} must be unique — this value is already used by another row.`;
  }

  const argMatch = /Argument `(\w+)` is missing/.exec(error.message);
  if (argMatch) return `Missing required field: ${argMatch[1]}`;

  const unknownMatch = /Unknown argument `(\w+)`/.exec(error.message);
  if (unknownMatch) return `"${unknownMatch[1]}" is not a field on this entity.`;

  // Prisma's validation errors are a multi-line diagnostic (file path, source snippet, the actual
  // reason) with the one sentence that matters last, not first.
  const lines = error.message.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || error.message;
}

/**
 * A picker cell may hold the target's id OR its name — a human filling in a new row finds a name
 * ("India") far easier to type than a UUID, and the export's reference column shows exactly that
 * name to copy. Tried as an id first since that is the more specific, unambiguous match.
 */
async function resolvePickerCell(fieldConfig, raw) {
  const refConfig = registry.get(fieldConfig.entity);
  if (!refConfig) return raw;

  const refIdField = refConfig.idField ?? 'id';
  const value = String(raw).trim();

  const byId = await prisma[refConfig.model].findUnique({ where: { [refIdField]: value } }).catch(() => null);
  if (byId) return byId[refIdField];

  const byName = await prisma[refConfig.model].findFirst({
    where: { name: { equals: value, mode: 'insensitive' } },
    select: { [refIdField]: true },
  });

  if (!byName) {
    throw new Error(`"${value}" is not a known ${refConfig.label.toLowerCase()} (checked by id and by name)`);
  }

  return byName[refIdField];
}

/**
 * Applies one workbook to one entity.
 *
 * Row-by-row, not a single bulk statement, because each row goes through libraryService.create/
 * update — the whole reason this file is safe to expose to a data_feeder's spreadsheet. A failure
 * on row 40 does not undo rows 1-39; the report says exactly which rows landed and which did not,
 * which is what lets someone fix only the broken rows and re-upload the same file.
 */
async function importEntity(entity, buffer, { user, reason, type } = {}) {
  const config = bulkConfigFor(entity);
  const idField = config.idField ?? 'id';
  const fields = config.fields; // every DECLARED field is importable by an admin; libraryService
  // strips what this user specifically may not write, same as the form does.

  if (config.requiredFilter === 'type' && !type) {
    throw ApiError.badRequest(`${config.label} import requires a "type"`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 1) {
    throw ApiError.badRequest('The file has no data. Export a template first if starting fresh.');
  }

  const headerCells = sheet.getRow(1).values; // 1-indexed; index 0 is unused
  const headers = Array.isArray(headerCells) ? headerCells.slice(1).map((h) => String(h ?? '').trim()) : [];
  const labelToField = new Map(fields.map((f) => [f.label, f]));
  const idColIndex = headers.findIndex((h) => h.toLowerCase() === 'id');

  const naturalKey = config.naturalKey ?? 'name';
  const naturalKeyWhere = config.requiredFilter === 'type' ? { type } : {};

  const existing = await prisma[config.model].findMany({
    where: naturalKeyWhere,
    select: { [idField]: true, [naturalKey]: true },
  });
  const byId = new Set(existing.map((r) => r[idField]));
  const byNaturalKey = new Map(
    existing.filter((r) => r[naturalKey] != null).map((r) => [String(r[naturalKey]).trim().toLowerCase(), r[idField]])
  );

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const isBlank = row.values.length <= 1 || row.values.every((v) => v === null || v === undefined || v === '');

    if (isBlank) {
      result.skipped += 1;
      continue;
    }

    try {
      const payload = {};

      for (let col = 0; col < headers.length; col += 1) {
        const fieldConfig = labelToField.get(headers[col]);
        if (!fieldConfig) continue; // reference-only / unrecognised column — ignored, not an error

        const raw = rawCellValue(row.getCell(col + 1));
        let value = cellValueIn(fieldConfig, raw);

        if (value !== undefined && fieldConfig.type === 'picker') {
          // eslint-disable-next-line no-await-in-loop
          value = await resolvePickerCell(fieldConfig, value);
        }

        if (value !== undefined) payload[fieldConfig.name] = value;
      }

      const sheetId = idColIndex >= 0 ? String(rawCellValue(row.getCell(idColIndex + 1)) ?? '').trim() : '';
      const naturalValue = payload[naturalKey];
      const matchedId =
        (sheetId && byId.has(sheetId) && sheetId) ||
        (naturalValue ? byNaturalKey.get(String(naturalValue).trim().toLowerCase()) : null) ||
        null;

      if (matchedId) {
        // eslint-disable-next-line no-await-in-loop
        await libraryService.update(entity, matchedId, payload, { user, reason });
        result.updated += 1;
      } else {
        if (config.requiredFilter === 'type') payload.type = type;

        // A blank cell on a field the DB requires (Currency.symbol, Hotel.description, …) would
        // otherwise reach Prisma bare and come back as a raw constraint-violation stack trace —
        // correct, but unreadable to whoever is fixing the spreadsheet. Caught here instead, with
        // the fallback a field may declare (Currency.symbol falls back to the code just entered)
        // applied first, so a genuinely-supplied value never gets overridden by it.
        fields
          .filter((f) => f.required && f.fallbackTo && (payload[f.name] === undefined || payload[f.name] === ''))
          .forEach((f) => {
            if (payload[f.fallbackTo] !== undefined) payload[f.name] = payload[f.fallbackTo];
          });

        const missing = fields.filter(
          (f) => f.required && (payload[f.name] === undefined || payload[f.name] === '')
        );
        if (missing.length > 0) {
          throw new Error(`Missing required field(s): ${missing.map((f) => f.label).join(', ')}`);
        }

        // eslint-disable-next-line no-await-in-loop
        const { row: created } = await libraryService.create(entity, payload, { user, reason });
        result.created += 1;
        if (created[naturalKey] != null) {
          byNaturalKey.set(String(created[naturalKey]).trim().toLowerCase(), created[idField]);
        }
        byId.add(created[idField]);
      }
    } catch (error) {
      result.errors.push({ row: rowNumber, message: cleanErrorMessage(error) });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hotel rate cards — the one non-registry entity worth this, because a rate sheet from a supplier
// arrives as a spreadsheet in the first place. Column shape is fixed (not registry-driven) since
// HotelRate is not a generic library entity.
// ---------------------------------------------------------------------------

const RATE_COLUMNS = [
  { header: 'id', key: 'id', width: 26 },
  { header: 'Room type', key: 'roomType', width: 22 },
  { header: 'Meal plan', key: 'mealPlan', width: 14 },
  { header: 'Occupancy', key: 'occupancy', width: 16 },
  { header: 'Valid from', key: 'validFrom', width: 14 },
  { header: 'Valid to', key: 'validTo', width: 14 },
  { header: 'Basis', key: 'basis', width: 22 },
  { header: 'Amount', key: 'amount', width: 14 },
  { header: 'Currency', key: 'currencyCode', width: 12 },
  { header: 'Tax %', key: 'taxPercent', width: 10 },
  { header: 'Min nights', key: 'minNights', width: 12 },
  { header: 'Max nights', key: 'maxNights', width: 12 },
  { header: 'Supplier', key: 'vendorName', width: 24 },
  { header: 'Published (live)', key: 'isPublished', width: 16 },
  { header: 'Notes', key: 'notes', width: 30 },
];

const OCCUPANCY_VALUES = ['SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'EXTRA_ADULT', 'CHILD_WITH_BED', 'CHILD_NO_BED', 'INFANT'];
const BASIS_VALUES = ['PER_ROOM_PER_NIGHT', 'PER_PERSON_PER_NIGHT', 'PER_ROOM_PER_STAY', 'PER_PERSON_PER_STAY'];

function excelDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d;
}

async function exportHotelRates(hotelId) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true } });
  if (!hotel) throw ApiError.notFound(`No hotel exists with id ${hotelId}`);

  const rates = await prisma.hotelRate.findMany({
    where: { hotelId, archived: false },
    orderBy: [{ roomType: 'asc' }, { occupancy: 'asc' }, { validFrom: 'asc' }],
    include: { vendor: { select: { name: true } } },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rates');
  sheet.columns = RATE_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rates.forEach((r) => {
    sheet.addRow({
      id: r.id,
      roomType: r.roomType,
      mealPlan: r.mealPlan,
      occupancy: r.occupancy,
      validFrom: excelDate(r.validFrom),
      validTo: excelDate(r.validTo),
      basis: r.basis,
      amount: Number(r.amount),
      currencyCode: r.currencyCode,
      taxPercent: r.taxPercent === null ? '' : Number(r.taxPercent),
      minNights: r.minNights ?? '',
      maxNights: r.maxNights ?? '',
      vendorName: r.vendor?.name ?? '',
      isPublished: r.isPublished,
      notes: r.notes ?? '',
    });
  });

  const guide = workbook.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Column', key: 'c', width: 20 },
    { header: 'Notes', key: 'n', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({ c: 'Occupancy', n: `One of: ${OCCUPANCY_VALUES.join(', ')}` });
  guide.addRow({ c: 'Basis', n: `One of: ${BASIS_VALUES.join(', ')}` });
  guide.addRow({ c: 'Valid from/to', n: 'Dates, inclusive at both ends.' });
  guide.addRow({ c: 'Supplier', n: 'The vendor name, exactly as it appears in the Library. Leave blank for "any supplier".' });
  guide.addRow({ c: 'Published (live)', n: 'TRUE or FALSE. An unpublished rate is never used to price a stay.' });
  guide.addRow({
    c: 'id',
    n: 'Leave blank to add a new rate. Every row in this file REPLACES the hotel\'s whole rate card on import — the same "replace as a set" behaviour as the Rates editor, so a row you deleted here is a row that is gone after import.',
  });

  return { buffer: await workbook.xlsx.writeBuffer(), filename: `${hotel.name.replace(/[^a-z0-9]+/gi, '-')}-rates.xlsx` };
}

/**
 * Replaces the hotel's whole rate card from a spreadsheet — same semantics as
 * rateController.saveHotelRates (archive-and-replace, locked rule 1), because a rate card is only
 * correct in relation to itself and "append forever" is how a card fills up with dead rows nobody
 * remembers to remove.
 */
async function importHotelRates(hotelId, buffer, { user, reason } = {}) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
  if (!hotel) throw ApiError.notFound(`No hotel exists with id ${hotelId}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 1) {
    throw ApiError.badRequest('The file has no data.');
  }

  const headers = sheet.getRow(1).values.slice(1).map((h) => String(h ?? '').trim());
  const colIndex = (label) => headers.indexOf(label);
  const idx = Object.fromEntries(RATE_COLUMNS.map((c) => [c.key, colIndex(c.header)]));

  const vendorNames = new Set();
  const draftRows = [];
  const errors = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const isBlank = row.values.length <= 1;
    if (isBlank) continue;

    const get = (key) => (idx[key] >= 0 ? rawCellValue(row.getCell(idx[key] + 1)) : undefined);

    const roomType = get('roomType');
    const amount = get('amount');
    const currencyCode = get('currencyCode');
    const validFrom = get('validFrom');
    const validTo = get('validTo');

    if (!roomType || amount === undefined || amount === '' || !currencyCode || !validFrom || !validTo) {
      errors.push({ row: rowNumber, message: 'Room type, dates, amount and currency are all required.' });
      continue;
    }

    const occupancy = String(get('occupancy') || 'DOUBLE').toUpperCase();
    if (!OCCUPANCY_VALUES.includes(occupancy)) {
      errors.push({ row: rowNumber, message: `"${occupancy}" is not a valid occupancy.` });
      continue;
    }

    const basis = String(get('basis') || 'PER_ROOM_PER_NIGHT').toUpperCase();
    if (!BASIS_VALUES.includes(basis)) {
      errors.push({ row: rowNumber, message: `"${basis}" is not a valid basis.` });
      continue;
    }

    const vendorName = String(get('vendorName') || '').trim();
    if (vendorName) vendorNames.add(vendorName.toLowerCase());

    draftRows.push({
      rowNumber,
      roomType: String(roomType).trim(),
      mealPlan: String(get('mealPlan') || '').trim(),
      occupancy,
      validFrom,
      validTo,
      basis,
      amount: Number(amount),
      currencyCode: String(currencyCode).trim().toUpperCase(),
      taxPercent: get('taxPercent') === '' || get('taxPercent') === undefined ? null : Number(get('taxPercent')),
      minNights: get('minNights') === '' || get('minNights') === undefined ? null : Number(get('minNights')),
      maxNights: get('maxNights') === '' || get('maxNights') === undefined ? null : Number(get('maxNights')),
      vendorName: vendorName || null,
      isPublished: ['true', 'yes', '1', true].includes(
        typeof get('isPublished') === 'boolean' ? get('isPublished') : String(get('isPublished') || '').toLowerCase()
      ),
      notes: String(get('notes') || '').trim() || null,
    });
  }

  const vendors = vendorNames.size
    ? await prisma.vendor.findMany({
        where: { name: { in: [...vendorNames], mode: 'insensitive' } },
        select: { id: true, name: true },
      })
    : [];
  const vendorIdByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));

  const currencies = await prisma.currency.findMany({ select: { code: true } });
  const knownCurrencies = new Set(currencies.map((c) => c.code));

  const finalRows = [];
  draftRows.forEach((d) => {
    if (!knownCurrencies.has(d.currencyCode)) {
      errors.push({ row: d.rowNumber, message: `"${d.currencyCode}" is not a currency configured in the Library.` });
      return;
    }
    if (d.vendorName && !vendorIdByName.has(d.vendorName.toLowerCase())) {
      errors.push({ row: d.rowNumber, message: `"${d.vendorName}" is not a known supplier.` });
      return;
    }
    finalRows.push({ ...d, vendorId: d.vendorName ? vendorIdByName.get(d.vendorName.toLowerCase()) : null });
  });

  // All-or-nothing, unlike the generic entity import: a rate card is one set that must stay
  // internally consistent, not a list of independent rows — a half-applied replace would leave
  // the card in a state nobody chose.
  if (errors.length > 0) {
    return { created: 0, updated: 0, skipped: 0, errors, applied: false };
  }

  await prisma.$transaction(async (tx) => {
    await tx.hotelRate.updateMany({ where: { hotelId, archived: false }, data: { archived: true } });

    for (const r of finalRows) {
      // eslint-disable-next-line no-await-in-loop
      await tx.hotelRate.create({
        data: {
          hotelId,
          vendorId: r.vendorId,
          roomType: r.roomType,
          mealPlan: r.mealPlan,
          occupancy: r.occupancy,
          validFrom: new Date(r.validFrom),
          validTo: new Date(r.validTo),
          basis: r.basis,
          amount: r.amount,
          currencyCode: r.currencyCode,
          taxPercent: r.taxPercent,
          minNights: r.minNights,
          maxNights: r.maxNights,
          isPublished: r.isPublished,
          notes: r.notes,
        },
      });
    }

    await auditService.record(tx, {
      entityType: 'Hotel',
      entityId: hotelId,
      action: 'UPDATE',
      before: { rateCount: 'previous set' },
      after: { rateCount: finalRows.length, source: 'excel import' },
      actor: user,
      reason,
    });
  });

  return { created: finalRows.length, updated: 0, skipped: 0, errors: [], applied: true };
}

// ---------------------------------------------------------------------------
// Destinations — dedicated service, not registry-generic. See the file header for why.
// ---------------------------------------------------------------------------

const DESTINATION_COLUMNS = [
  { header: 'id', key: 'id' },
  { header: 'Name', key: 'name' },
  { header: 'Country', key: 'countryName' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Short name', key: 'shortName' },
  { header: 'Short code', key: 'shortCode' },
  { header: 'Time zone', key: 'timeZone' },
  { header: 'Cover image', key: 'coverImageUrl' },
  { header: 'Best season', key: 'bestSeason' },
  { header: 'Weather summary', key: 'weatherSummary' },
  { header: 'About', key: 'aboutDestination' },
  { header: 'General notes', key: 'generalNotes' },
  { header: 'Tours & transfers notes', key: 'toursAndTransfersNotes' },
  { header: 'FAQs', key: 'faqs' },
  { header: 'SEO title', key: 'seoTitle' },
  { header: 'SEO description', key: 'seoDescription' },
  { header: 'SEO keywords', key: 'seoKeywords', tags: true },
];

// Fields destinationService.create() itself accepts — everything else on DESTINATION_COLUMNS is
// applied with an immediate follow-up update() call, since create()'s parameter list is narrower
// than update()'s (see the file header). Keeping this list here, next to the columns it splits,
// is what stops the two drifting apart the next time a field is added.
const DESTINATION_CREATE_FIELDS = new Set([
  'name',
  'countryName',
  'city',
  'state',
  'shortName',
  'aboutDestination',
  'faqs',
]);

async function exportDestinations({ includeArchived = false, countryId } = {}) {
  const where = { ...(includeArchived ? {} : { archived: false }), ...(countryId ? { countryId } : {}) };

  const rows = await prisma.destination.findMany({
    where,
    include: { country: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Destinations');
  sheet.columns = DESTINATION_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((d) => {
    sheet.addRow({
      id: d.id,
      name: d.name,
      countryName: d.country?.name ?? '',
      city: d.city ?? '',
      state: d.state ?? '',
      shortName: d.shortName ?? '',
      shortCode: d.shortCode ?? '',
      timeZone: d.timeZone ?? '',
      coverImageUrl: d.coverImageUrl ?? '',
      bestSeason: d.bestSeason ?? '',
      weatherSummary: d.weatherSummary ?? '',
      aboutDestination: d.aboutDestination ?? '',
      generalNotes: d.generalNotes ?? '',
      toursAndTransfersNotes: d.toursAndTransfersNotes ?? '',
      faqs: d.faqs ?? '',
      seoTitle: d.seoTitle ?? '',
      seoDescription: d.seoDescription ?? '',
      seoKeywords: (d.seoKeywords ?? []).join(', '),
    });
  });

  const guide = workbook.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Column', key: 'c', width: 26 },
    { header: 'Notes', key: 'n', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({ c: 'Country', n: 'The country\'s name, exactly as it appears in the Library. Unrecognised names are created on first mention, same as typing one into the form.' });
  guide.addRow({ c: 'SEO keywords', n: 'Comma-separated.' });
  guide.addRow({
    c: 'id',
    n: 'Leave blank on a new row. Filled in, it must match an existing destination to update it; otherwise matching falls back to Name (case-insensitive).',
  });

  return { buffer: await workbook.xlsx.writeBuffer(), filename: 'destinations-export.xlsx' };
}

async function importDestinations(buffer, { user, reason } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 1) throw ApiError.badRequest('The file has no data.');

  const headers = sheet.getRow(1).values.slice(1).map((h) => String(h ?? '').trim());
  const labelToKey = new Map(DESTINATION_COLUMNS.map((c) => [c.header, c.key]));
  const idCol = headers.indexOf('id');

  const existing = await prisma.destination.findMany({ select: { id: true, name: true } });
  const byId = new Set(existing.map((r) => r.id));
  const byName = new Map(existing.map((r) => [r.name.trim().toLowerCase(), r.id]));

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.length <= 1) {
      result.skipped += 1;
      continue;
    }

    try {
      const payload = {};
      headers.forEach((h, col) => {
        const key = labelToKey.get(h);
        if (!key) return;
        const raw = rawCellValue(row.getCell(col + 1));
        if (raw === null || raw === undefined || raw === '') return;

        const columnDef = DESTINATION_COLUMNS.find((c) => c.key === key);
        payload[key] = columnDef?.tags
          ? String(raw).split(',').map((s) => s.trim()).filter(Boolean)
          : String(raw).trim();
      });

      const sheetId = idCol >= 0 ? String(rawCellValue(row.getCell(idCol + 1)) ?? '').trim() : '';
      const matchedId =
        (sheetId && byId.has(sheetId) && sheetId) ||
        (payload.name ? byName.get(payload.name.trim().toLowerCase()) : null) ||
        null;

      if (matchedId) {
        // eslint-disable-next-line no-await-in-loop
        const { destination: updated } = await destinationService.update(matchedId, payload);
        result.updated += 1;
        byName.set(updated.name.trim().toLowerCase(), updated.id);
      } else {
        if (!payload.name) throw new Error('Missing required field: Name');

        const createPayload = {};
        const updatePayload = {};
        Object.entries(payload).forEach(([key, value]) => {
          if (DESTINATION_CREATE_FIELDS.has(key)) createPayload[key] = value;
          else updatePayload[key] = value;
        });

        // eslint-disable-next-line no-await-in-loop
        const { destination: created } = await destinationService.create(createPayload);
        if (Object.keys(updatePayload).length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await destinationService.update(created.id, updatePayload);
        }
        result.created += 1;
        byId.add(created.id);
        byName.set(created.name.trim().toLowerCase(), created.id);
      }
    } catch (error) {
      result.errors.push({ row: rowNumber, message: cleanErrorMessage(error) });
    }
  }

  if ((result.created > 0 || result.updated > 0) && reason) {
    // destinationService itself already writes no audit entries of its own (unlike libraryService),
    // so a bulk import's provenance would otherwise be invisible next to the rows it touched. This
    // is a summary note, not a per-row entry — per-row audit history is exactly what the "created/
    // updated" counts above already are.
    await auditService.record(prisma, {
      entityType: 'Destination',
      entityId: 'bulk-import',
      action: 'UPDATE',
      after: { created: result.created, updated: result.updated },
      actor: user,
      reason,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hotels — dedicated service, scoped to one destination (matches how HotelsTab itself works: pick
// a destination first, then see/manage its hotels).
// ---------------------------------------------------------------------------

const HOTEL_COLUMNS = [
  { header: 'id', key: 'id' },
  { header: 'Name', key: 'name' },
  { header: 'Category', key: 'category' },
  { header: 'Star rating', key: 'starRating', number: true },
  { header: 'Description', key: 'description' },
  { header: 'Address', key: 'address' },
  { header: 'Map link', key: 'mapLink' },
  { header: 'Cover image', key: 'coverImageUrl' },
  { header: 'Room type', key: 'roomType' },
  { header: 'Meal plan', key: 'mealPlan' },
  { header: 'Refundable', key: 'refundable', boolean: true },
  { header: 'Services offered', key: 'servicesOffered' },
];

const HOTEL_CREATE_FIELDS = new Set(['name', 'category', 'description', 'starRating', 'roomType', 'mealPlan']);

async function exportHotelsForDestination(destinationId, { includeArchived = false } = {}) {
  const destination = await prisma.destination.findUnique({ where: { id: destinationId }, select: { id: true, name: true } });
  if (!destination) throw ApiError.notFound(`No destination exists with id ${destinationId}`);

  const rows = await prisma.hotel.findMany({
    where: { destinationId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { name: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Hotels');
  sheet.columns = HOTEL_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((h) => {
    sheet.addRow({
      id: h.id,
      name: h.name,
      category: h.category,
      starRating: h.starRating ?? '',
      description: h.description,
      address: h.address ?? '',
      mapLink: h.mapLink ?? '',
      coverImageUrl: h.coverImageUrl ?? '',
      roomType: h.roomType ?? '',
      mealPlan: h.mealPlan ?? '',
      refundable: h.refundable === null ? '' : h.refundable,
      servicesOffered: h.servicesOffered ?? '',
    });
  });

  const guide = workbook.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Column', key: 'c', width: 20 },
    { header: 'Notes', key: 'n', width: 60 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({ c: 'Refundable', n: 'TRUE, FALSE, or blank for "not stated".' });
  guide.addRow({ c: 'id', n: 'Leave blank on a new row; otherwise matched by id, then by Name within this destination.' });

  return { buffer: await workbook.xlsx.writeBuffer(), filename: `${destination.name.replace(/[^a-z0-9]+/gi, '-')}-hotels.xlsx` };
}

async function importHotelsForDestination(destinationId, buffer, { user, reason } = {}) {
  await destinationService.assertActiveDestination(destinationId);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 1) throw ApiError.badRequest('The file has no data.');

  const headers = sheet.getRow(1).values.slice(1).map((h) => String(h ?? '').trim());
  const labelToKey = new Map(HOTEL_COLUMNS.map((c) => [c.header, c.key]));
  const idCol = headers.indexOf('id');

  const existing = await prisma.hotel.findMany({ where: { destinationId }, select: { id: true, name: true } });
  const byId = new Set(existing.map((r) => r.id));
  const byName = new Map(existing.map((r) => [r.name.trim().toLowerCase(), r.id]));

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.length <= 1) {
      result.skipped += 1;
      continue;
    }

    try {
      const payload = {};
      headers.forEach((h, col) => {
        const key = labelToKey.get(h);
        if (!key) return;
        const raw = rawCellValue(row.getCell(col + 1));
        if (raw === null || raw === undefined || raw === '') return;

        const columnDef = HOTEL_COLUMNS.find((c) => c.key === key);
        if (columnDef?.number) payload[key] = Number(raw);
        else if (columnDef?.boolean) payload[key] = ['true', 'yes', '1'].includes(String(raw).trim().toLowerCase());
        else payload[key] = String(raw).trim();
      });

      const sheetId = idCol >= 0 ? String(rawCellValue(row.getCell(idCol + 1)) ?? '').trim() : '';
      const matchedId =
        (sheetId && byId.has(sheetId) && sheetId) ||
        (payload.name ? byName.get(payload.name.trim().toLowerCase()) : null) ||
        null;

      if (matchedId) {
        // eslint-disable-next-line no-await-in-loop
        const updated = await hotelService.update(matchedId, payload);
        result.updated += 1;
        byName.set(updated.name.trim().toLowerCase(), updated.id);
      } else {
        const missingKeys = ['name', 'category', 'description'].filter((f) => !payload[f]);
        if (missingKeys.length > 0) {
          const labels = missingKeys.map((k) => HOTEL_COLUMNS.find((c) => c.key === k)?.header ?? k);
          throw new Error(`Missing required field(s): ${labels.join(', ')}`);
        }

        const createPayload = { destinationId };
        const updatePayload = {};
        Object.entries(payload).forEach(([key, value]) => {
          if (HOTEL_CREATE_FIELDS.has(key)) createPayload[key] = value;
          else updatePayload[key] = value;
        });

        // eslint-disable-next-line no-await-in-loop
        const created = await hotelService.create(createPayload);
        if (Object.keys(updatePayload).length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await hotelService.update(created.id, updatePayload);
        }
        result.created += 1;
        byId.add(created.id);
        byName.set(created.name.trim().toLowerCase(), created.id);
      }
    } catch (error) {
      result.errors.push({ row: rowNumber, message: cleanErrorMessage(error) });
    }
  }

  if ((result.created > 0 || result.updated > 0) && reason) {
    await auditService.record(prisma, {
      entityType: 'Hotel',
      entityId: 'bulk-import',
      action: 'UPDATE',
      after: { destinationId, created: result.created, updated: result.updated },
      actor: user,
      reason,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Day templates — title/description only, scoped to one destination. Events (the substance of a
// template) stay on the dedicated itinerary-day builder, same reasoning as hotel rates getting
// their own separate bulk mechanism rather than being folded into the hotel's own fields.
// ---------------------------------------------------------------------------

const DAY_TEMPLATE_COLUMNS = [
  { header: 'id', key: 'id' },
  { header: 'Title', key: 'title' },
  { header: 'Description', key: 'description' },
];

async function exportDayTemplatesForDestination(destinationId, { includeArchived = false } = {}) {
  const destination = await prisma.destination.findUnique({ where: { id: destinationId }, select: { id: true, name: true } });
  if (!destination) throw ApiError.notFound(`No destination exists with id ${destinationId}`);

  const rows = await prisma.dayTemplate.findMany({
    where: { destinationId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { title: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Day templates');
  sheet.columns = DAY_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 30 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((t) => sheet.addRow({ id: t.id, title: t.title, description: t.description }));

  const guide = workbook.addWorksheet('Field guide');
  guide.columns = [
    { header: 'Column', key: 'c', width: 20 },
    { header: 'Notes', key: 'n', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({
    c: 'Events',
    n: 'Not part of this file — a template\'s day-by-day events are built on its own screen in the Library, the same way a hotel\'s rate card is.',
  });
  guide.addRow({ c: 'id', n: 'Leave blank on a new row; otherwise matched by id, then by Title within this destination.' });

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    filename: `${destination.name.replace(/[^a-z0-9]+/gi, '-')}-day-templates.xlsx`,
  };
}

async function importDayTemplatesForDestination(destinationId, buffer, { user, reason } = {}) {
  await destinationService.assertActiveDestination(destinationId);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 1) throw ApiError.badRequest('The file has no data.');

  const headers = sheet.getRow(1).values.slice(1).map((h) => String(h ?? '').trim());
  const labelToKey = new Map(DAY_TEMPLATE_COLUMNS.map((c) => [c.header, c.key]));
  const idCol = headers.indexOf('id');

  const existing = await prisma.dayTemplate.findMany({ where: { destinationId }, select: { id: true, title: true } });
  const byId = new Set(existing.map((r) => r.id));
  const byTitle = new Map(existing.map((r) => [r.title.trim().toLowerCase(), r.id]));

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.length <= 1) {
      result.skipped += 1;
      continue;
    }

    try {
      const payload = {};
      headers.forEach((h, col) => {
        const key = labelToKey.get(h);
        if (!key) return;
        const raw = rawCellValue(row.getCell(col + 1));
        if (raw !== null && raw !== undefined && raw !== '') payload[key] = String(raw).trim();
      });

      const sheetId = idCol >= 0 ? String(rawCellValue(row.getCell(idCol + 1)) ?? '').trim() : '';
      const matchedId =
        (sheetId && byId.has(sheetId) && sheetId) ||
        (payload.title ? byTitle.get(payload.title.trim().toLowerCase()) : null) ||
        null;

      if (matchedId) {
        // eslint-disable-next-line no-await-in-loop
        const updated = await dayTemplateService.update(matchedId, payload);
        result.updated += 1;
        byTitle.set(updated.title.trim().toLowerCase(), updated.id);
      } else {
        const missingKeys = ['title', 'description'].filter((f) => !payload[f]);
        if (missingKeys.length > 0) {
          const labels = missingKeys.map((k) => DAY_TEMPLATE_COLUMNS.find((c) => c.key === k)?.header ?? k);
          throw new Error(`Missing required field(s): ${labels.join(', ')}`);
        }

        // eslint-disable-next-line no-await-in-loop
        const created = await dayTemplateService.create({ destinationId, ...payload });
        result.created += 1;
        byId.add(created.id);
        byTitle.set(created.title.trim().toLowerCase(), created.id);
      }
    } catch (error) {
      result.errors.push({ row: rowNumber, message: cleanErrorMessage(error) });
    }
  }

  if ((result.created > 0 || result.updated > 0) && reason) {
    await auditService.record(prisma, {
      entityType: 'DayTemplate',
      entityId: 'bulk-import',
      action: 'UPDATE',
      after: { destinationId, created: result.created, updated: result.updated },
      actor: user,
      reason,
    });
  }

  return result;
}

module.exports = {
  exportEntity,
  importEntity,
  exportHotelRates,
  importHotelRates,
  exportDestinations,
  importDestinations,
  exportHotelsForDestination,
  importHotelsForDestination,
  exportDayTemplatesForDestination,
  importDayTemplatesForDestination,
  bulkConfigFor,
};
