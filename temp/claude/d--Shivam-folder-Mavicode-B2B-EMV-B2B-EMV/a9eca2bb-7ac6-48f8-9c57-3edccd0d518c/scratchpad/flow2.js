// Full business-flow test v2 — correct payloads/envelopes per the real schemas.
const BACKEND = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/backend';
const { PrismaClient } = require(BACKEND + '/node_modules/@prisma/client');
const prisma = new PrismaClient();

const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
const failures = [];

async function call(method, path, { token, body, form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(form ? { body: form } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail).slice(0, 450)}` : ''}`); }
}
const ok2xx = (r) => r.status >= 200 && r.status < 300;

// Controllers wrap the entity under a named key ({country}, {package}, {quote}, ...).
const idOf = (b) => {
  if (!b || typeof b !== 'object') return undefined;
  if (typeof b.id === 'string') return b.id;
  for (const v of Object.values(b)) if (v && typeof v === 'object' && typeof v.id === 'string') return v.id;
  return undefined;
};

// A tiny valid PNG, so the multipart upload is a real image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
function screenshotForm(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append('screenshot', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  return fd;
}

async function newPartner(label, stamp) {
  const email = `${label}${stamp}@testagency.com`;
  const password = 'Partner@123';
  await call('POST', '/api/auth/register', {
    body: {
      companyName: `${label} Travels ${stamp}`, ownerName: `${label} Owner`,
      gstNumber: `29${label.toUpperCase()}${String(stamp).slice(-5)}Z`, businessEmail: email,
      mobile: '+919876500011', officeAddress: '9 Test Road', city: 'Pune',
      state: 'Maharashtra', country: 'India', pincode: '411001', password,
    },
  });
  const u = await prisma.user.findUnique({ where: { email } });
  await call('POST', '/api/auth/verify-otp', { body: { email, otp: u.otpCode } });
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  return { email, token: r.body?.token, companyName: `${label} Travels ${stamp}` };
}

(async () => {
  const stamp = Date.now();

  console.log('\n=== A. Auth ===');
  let r = await call('POST', '/api/auth/login', { body: { email: 'admin@emv.com', password: 'Admin@123' } });
  check('admin login', ok2xx(r) && !!r.body?.token, r.body);
  const admin = r.body?.token;

  const A = await newPartner('flow', stamp);
  check('partner registered + OTP verified + logged in', !!A.token, A);
  if (!admin || !A.token) { console.log('Aborting'); await prisma.$disconnect(); process.exit(1); }

  console.log('\n=== B. Admin library -> package ===');
  r = await call('POST', '/api/destinations', { token: admin, body: { name: `Bali ${stamp}` } });
  check('create destination', ok2xx(r), r.body);
  const destId = idOf(r.body);

  const dayIds = [];
  for (let i = 1; i <= 4; i++) {
    r = await call('POST', '/api/day-templates', { token: admin, body: { destinationId: destId, title: `Day ${i}`, description: `Day ${i} itinerary detail.` } });
    if (idOf(r.body)) dayIds.push(idOf(r.body));
  }
  check('create 4 day templates', dayIds.length === 4, { got: dayIds.length, last: r.body });

  r = await call('POST', '/api/hotels', { token: admin, body: { destinationId: destId, name: 'Test Resort', category: '4 Star', description: 'Beachfront resort.' } });
  check('create hotel', ok2xx(r), r.body);
  const hotelId = idOf(r.body);

  r = await call('POST', '/api/packages', {
    token: admin,
    body: {
      destinationId: destId, title: `Bali Escape ${stamp}`, days: 4, nights: 3, rawPrice: 50000,
      inclusions: 'Hotel, breakfast, transfers', exclusions: 'Airfare, visa',
      dayTemplateIds: dayIds, hotelIds: [hotelId],
    },
  });
  check('create package (days match itinerary)', ok2xx(r), r.body);
  const pkgId = idOf(r.body);

  r = await call('POST', '/api/packages', {
    token: admin,
    body: {
      destinationId: destId, title: `Short ${stamp}`, days: 4, nights: 3, rawPrice: 1000,
      inclusions: 'x', exclusions: 'y', dayTemplateIds: [dayIds[0]],
    },
  });
  check('rejects package whose itinerary is shorter than days (400)', r.status === 400, { status: r.status });

  r = await call('GET', `/api/packages/${pkgId}`, { token: A.token });
  const pkg = r.body?.package;
  check('partner views package detail', ok2xx(r) && !!pkg, { status: r.status });
  check('package copied 4 days from templates', pkg?.days?.length === 4 || pkg?.packageDays?.length === 4,
    { dayCount: pkg?.days?.length ?? pkg?.packageDays?.length, keys: Object.keys(pkg || {}) });

  console.log('\n=== C. White-label quote + pricing ===');
  r = await call('POST', '/api/quotes', {
    token: A.token,
    body: {
      packageId: pkgId, markupAmount: 8000, branding: 'OWN',
      leadName: 'Mr Client', contactNumber: '+919812345678', email: 'client@example.com',
      travelDate: '2026-12-20', adults: 2, children: 1,
    },
  });
  check('partner creates OWN-branded quote', ok2xx(r), r.body);
  const quote = r.body?.quote;
  const quoteId = quote?.id;
  check('sellingPrice = rawPrice 50000 + markup 8000 = 58000', Number(quote?.sellingPrice) === 58000,
    { sellingPrice: quote?.sellingPrice, raw: quote?.rawPriceAtQuote });

  r = await call('GET', `/api/quotes/${quoteId}`, { token: A.token });
  check('partner reads own quote', ok2xx(r), { status: r.status });

  r = await call('GET', `/api/quotes/${quoteId}/pdf`, { token: A.token });
  check('white-label PDF generates (200)', r.status === 200, { status: r.status, body: r.body });

  console.log('\n=== D. Payment submission -> reconciliation -> approval ===');
  r = await call('POST', `/api/quotes/${quoteId}/payment`, {
    token: A.token,
    form: screenshotForm({ transactionId: `TXN${stamp}`, amount: 50000 }),
  });
  check('partner submits payment proof (multipart + screenshot)', ok2xx(r), r.body);
  const payId = r.body?.payment?.id;
  check('amount matching wholesale is not flagged', r.body?.reconciliation?.reconciliationMismatch === false,
    r.body?.reconciliation);

  r = await call('GET', '/api/admin/payments', { token: admin });
  check('payment appears in admin queue', ok2xx(r) && JSON.stringify(r.body).includes(`TXN${stamp}`), { status: r.status });

  r = await call('GET', `/api/admin/payments/${payId}/screenshot`, { token: admin });
  check('admin can fetch payment screenshot', r.status === 200, { status: r.status, body: r.body });

  r = await call('POST', `/api/admin/payments/${payId}/reject`, { token: admin, body: {} });
  check('reject without adminRemarks is refused (400)', r.status === 400, { status: r.status });

  r = await call('POST', `/api/admin/payments/${payId}/approve`, { token: admin, body: { adminRemarks: 'Verified in bank statement' } });
  check('admin approves payment', ok2xx(r), r.body);

  const paidQuote = await prisma.quote.findUnique({ where: { id: quoteId } });
  check('quote status advanced after approval', paidQuote?.status && paidQuote.status !== 'DRAFT',
    { status: paidQuote?.status });

  r = await call('GET', '/api/notifications', { token: A.token });
  const noteJson = JSON.stringify(r.body);
  check('partner got in-app notification for approval', ok2xx(r) && /approv/i.test(noteJson), { sample: noteJson.slice(0, 250) });

  console.log('\n=== E. Reconciliation mismatch path ===');
  r = await call('POST', '/api/quotes', {
    token: A.token,
    body: {
      packageId: pkgId, markupAmount: 5000, branding: 'EMV', leadName: 'Mismatch Lead',
      contactNumber: '+919812345679', email: 'm@example.com', travelDate: '2026-12-22', adults: 1,
    },
  });
  const q2 = r.body?.quote?.id;
  r = await call('POST', `/api/quotes/${q2}/payment`, {
    token: A.token,
    form: screenshotForm({ transactionId: `TXNBAD${stamp}`, amount: 999 }),
  });
  check('underpayment is flagged as reconciliation mismatch', r.body?.reconciliation?.reconciliationMismatch === true,
    r.body?.reconciliation);

  console.log('\n=== F. Visa module end-to-end ===');
  r = await call('POST', '/api/visa-countries', { token: admin, body: { name: `Testland ${stamp}`, baseFee: 6000 } });
  check('create visa country', ok2xx(r), r.body);
  const vcId = idOf(r.body);

  r = await call('POST', `/api/visa-countries/${vcId}/documents`, { token: admin, body: { documentName: 'Passport scan', isMandatory: true } });
  check('add required-document checklist entry', ok2xx(r), r.body);

  r = await call('GET', `/api/visa-countries/${vcId}`, { token: A.token });
  check('partner views visa country + checklist', ok2xx(r), { status: r.status });

  const pax = {
    fullName: 'Client One', gender: 'Male', dob: '1990-05-01', nationality: 'Indian',
    passportNumber: 'P1234567', passportExpiry: '2030-01-01',
    travelDate: '2026-12-20', returnDate: '2026-12-28',
  };
  r = await call('POST', '/api/visa-requests', { token: A.token, body: { visaCountryId: vcId, markupAmount: 1000, passengers: [pax] } });
  check('partner creates visa request', ok2xx(r), r.body);
  const vr = r.body?.visaRequest;
  const vrId = vr?.id;
  check('visa sellingPrice = 6000*1pax + 1000 = 7000', Number(vr?.sellingPrice) === 7000, { sellingPrice: vr?.sellingPrice });
  check('application number assigned', !!vr?.applicationNumber, { applicationNumber: vr?.applicationNumber });

  r = await call('POST', '/api/visa-requests', {
    token: A.token,
    body: { visaCountryId: vcId, markupAmount: 0, passengers: [{ ...pax, passportExpiry: '2026-01-01' }] },
  });
  check('rejects passport expiring before travel (400)', r.status === 400, { status: r.status });

  r = await call('POST', `/api/visa-requests/${vrId}/payment`, {
    token: A.token,
    form: screenshotForm({ transactionId: `VTXN${stamp}`, amount: 6000 }),
  });
  check('partner submits visa payment', ok2xx(r), r.body);
  const vPayId = r.body?.payment?.id;

  r = await call('GET', '/api/admin/payments?type=VISA', { token: admin });
  check('visa payment in admin queue (type=VISA filter)', ok2xx(r) && JSON.stringify(r.body).includes(`VTXN${stamp}`), { status: r.status });

  if (vPayId) {
    r = await call('POST', `/api/admin/payments/${vPayId}/approve`, { token: admin, body: { adminRemarks: 'ok' } });
    check('admin approves visa payment', ok2xx(r), r.body);
  }

  r = await call('POST', `/api/admin/visa-requests/${vrId}/start-processing`, { token: admin, body: {} });
  check('admin starts visa processing', ok2xx(r) || r.status === 404, { status: r.status, body: r.body });

  r = await call('POST', `/api/admin/visa-requests/${vrId}/complete`, { token: admin, body: {} });
  check('admin completes visa request', ok2xx(r), r.body);

  const doneVr = await prisma.visaRequest.findUnique({ where: { id: vrId } });
  check('visa request status = COMPLETED in DB', doneVr?.status === 'COMPLETED', { status: doneVr?.status });

  console.log('\n=== G. Reports + dashboard ===');
  r = await call('GET', '/api/admin/reports/summary', { token: admin });
  check('admin report summary returns data', ok2xx(r) && !!r.body, { status: r.status, keys: Object.keys(r.body || {}) });

  r = await call('GET', '/api/dashboard', { token: A.token });
  check('partner dashboard returns data', ok2xx(r), { status: r.status, keys: Object.keys(r.body || {}) });

  r = await call('GET', '/api/admin/agencies', { token: admin });
  check('admin sees the new agency', ok2xx(r) && JSON.stringify(r.body).includes(A.companyName), { status: r.status });

  console.log('\n=== H. Tenant isolation + role guards ===');
  const B = await newPartner('iso', stamp);
  r = await call('GET', `/api/quotes/${quoteId}`, { token: B.token });
  check("partner B cannot read partner A's quote (403/404)", r.status === 403 || r.status === 404, { status: r.status, body: r.body });

  r = await call('GET', '/api/quotes', { token: B.token });
  check('partner B quote list excludes A', ok2xx(r) && !JSON.stringify(r.body).includes(quoteId), { status: r.status });

  r = await call('GET', `/api/visa-requests/${vrId}`, { token: B.token });
  check("partner B cannot read A's visa request", r.status === 403 || r.status === 404, { status: r.status });

  r = await call('POST', `/api/admin/payments/${payId}/approve`, { token: B.token, body: {} });
  check('partner cannot approve payments (403)', r.status === 403, { status: r.status });

  r = await call('POST', '/api/destinations', { token: B.token, body: { name: 'Hack' } });
  check('partner cannot write to admin library (403)', r.status === 403, { status: r.status });

  r = await call('GET', '/api/auth/me', { token: 'garbage.token.here' });
  check('malformed token -> 401', r.status === 401, { status: r.status });

  console.log(`\n=========================\n  PASSED: ${pass}   FAILED: ${fail}`);
  if (failures.length) console.log('  Failed checks:\n' + failures.map((f) => '   - ' + f).join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('CRASH:', e); await prisma.$disconnect(); process.exit(1); });
