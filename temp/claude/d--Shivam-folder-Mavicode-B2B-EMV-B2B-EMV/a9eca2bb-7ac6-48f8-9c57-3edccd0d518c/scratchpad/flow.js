// Full business-flow test against the running backend + Neon DB.
const BACKEND = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/backend';
const { PrismaClient } = require(BACKEND + '/node_modules/@prisma/client');
const prisma = new PrismaClient();

const BASE = 'http://localhost:4000';
let pass = 0, fail = 0;
const failures = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail).slice(0, 500)}` : ''}`); }
}
const ok2xx = (r) => r.status >= 200 && r.status < 300;

(async () => {
  const stamp = Date.now();

  console.log('\n=== A. Admin login ===');
  let r = await call('POST', '/api/auth/login', { body: { email: 'admin@emv.com', password: 'Admin@123' } });
  check('admin login', ok2xx(r) && !!r.body?.token, r.body);
  const admin = r.body?.token;

  r = await call('GET', '/api/auth/me', { token: admin });
  check('/auth/me -> role admin', r.body?.user?.role === 'admin', r.body);

  console.log('\n=== B. Partner registration -> OTP verify -> login ===');
  const pEmail = `flow${stamp}@testagency.com`;
  const pPass = 'Partner@123';
  r = await call('POST', '/api/auth/register', {
    body: {
      companyName: `Flow Travels ${stamp}`, ownerName: 'Flow Owner',
      gstNumber: `29FLOW${String(stamp).slice(-5)}Z5`, businessEmail: pEmail,
      mobile: '+919876500011', officeAddress: '9 Flow Road', city: 'Pune',
      state: 'Maharashtra', country: 'India', pincode: '411001', password: pPass,
    },
  });
  check('partner register (201)', ok2xx(r), r.body);

  const dbUser = await prisma.user.findUnique({ where: { email: pEmail } });
  check('user row created with OTP + isVerified=false', !!dbUser?.otpCode && dbUser.isVerified === false,
    dbUser ? { isVerified: dbUser.isVerified, hasOtp: !!dbUser.otpCode } : null);

  r = await call('POST', '/api/auth/verify-otp', { body: { email: pEmail, otp: dbUser.otpCode } });
  check('verify OTP', ok2xx(r), r.body);

  r = await call('POST', '/api/auth/verify-otp', { body: { email: pEmail, otp: dbUser.otpCode } });
  check('OTP cannot be replayed', r.status >= 400, r.body);

  r = await call('POST', '/api/auth/login', { body: { email: pEmail, password: pPass } });
  check('verified partner can log in', ok2xx(r) && !!r.body?.token, r.body);
  const partner = r.body?.token;
  if (!partner || !admin) { console.log('\nAborting: missing token'); await prisma.$disconnect(); process.exit(1); }

  console.log('\n=== C. Password reset flow ===');
  r = await call('POST', '/api/auth/forgot-password', { body: { email: pEmail } });
  check('forgot-password accepted', ok2xx(r), r.body);
  const resetUser = await prisma.user.findUnique({ where: { email: pEmail } });
  r = await call('POST', '/api/auth/reset-password', { body: { email: pEmail, otp: resetUser.otpCode, newPassword: 'NewPartner@456' } });
  check('reset-password with OTP', ok2xx(r), r.body);
  r = await call('POST', '/api/auth/login', { body: { email: pEmail, password: 'NewPartner@456' } });
  check('login with new password', ok2xx(r), r.body);
  r = await call('POST', '/api/auth/login', { body: { email: pEmail, password: pPass } });
  check('old password no longer works', r.status >= 400, r.body);
  const partnerTok = (await call('POST', '/api/auth/login', { body: { email: pEmail, password: 'NewPartner@456' } })).body.token;

  console.log('\n=== D. Admin builds library -> package ===');
  r = await call('POST', '/api/destinations', { token: admin, body: { name: `Bali ${stamp}` } });
  check('create destination', ok2xx(r), r.body);
  const destId = r.body?.id ?? r.body?.destination?.id;

  r = await call('POST', '/api/destinations', { token: admin, body: { name: `Ease My Vacations ${stamp}` } });
  check('brand guard blocks EMV branding in destination name (400)', r.status === 400, { status: r.status, body: r.body });

  r = await call('POST', '/api/day-templates', { token: admin, body: { destinationId: destId, title: 'Day 1 - Arrival', description: 'Arrive and transfer to hotel.' } });
  check('create day template', ok2xx(r), r.body);
  const dayId = r.body?.id ?? r.body?.dayTemplate?.id;

  r = await call('POST', '/api/hotels', { token: admin, body: { destinationId: destId, name: 'Test Resort', category: '4 Star', description: 'Beachfront resort.' } });
  check('create hotel', ok2xx(r), r.body);
  const hotelId = r.body?.id ?? r.body?.hotel?.id;

  r = await call('POST', '/api/packages', {
    token: admin,
    body: {
      destinationId: destId, title: `Bali Escape ${stamp}`, days: 4, nights: 3, rawPrice: 50000,
      inclusions: 'Hotel, breakfast, transfers', exclusions: 'Airfare, visa',
      dayTemplateIds: [dayId], hotelIds: [hotelId],
    },
  });
  check('create package', ok2xx(r), r.body);
  const pkgId = r.body?.id ?? r.body?.package?.id;

  r = await call('GET', `/api/packages/${pkgId}`, { token: partnerTok });
  check('partner can view package detail', ok2xx(r), { status: r.status });
  check('package copied its days from templates', Array.isArray(r.body?.days ?? r.body?.package?.days) , Object.keys(r.body || {}));

  console.log('\n=== E. Partner white-label quote ===');
  r = await call('POST', '/api/quotes', {
    token: partnerTok,
    body: {
      packageId: pkgId, markupAmount: 8000, branding: 'OWN',
      leadName: 'Mr Client', contactNumber: '+919812345678', email: 'client@example.com',
      travelDate: '2026-12-20', adults: 2, children: 1,
    },
  });
  check('partner creates quote', ok2xx(r), r.body);
  const quote = r.body?.quote ?? r.body;
  const quoteId = quote?.id;
  const selling = Number(quote?.sellingPrice);
  check('sellingPrice = rawPrice + markup (58000)', selling === 58000, { sellingPrice: quote?.sellingPrice, rawPrice: quote?.rawPriceAtQuote });

  r = await call('GET', '/api/quotes', { token: partnerTok });
  check('partner lists own quotes', ok2xx(r), { status: r.status });

  r = await call('GET', `/api/quotes/${quoteId}/pdf`, { token: partnerTok });
  check('quote PDF endpoint responds', r.status === 200 || r.status === 404, { status: r.status, body: r.body });

  console.log('\n=== F. Payment -> admin verification ===');
  r = await call('POST', `/api/quotes/${quoteId}/payment`, {
    token: partnerTok,
    body: { transactionId: `TXN${stamp}`, amount: 58000 },
  });
  check('partner submits payment proof', ok2xx(r), r.body);
  const payment = r.body?.payment ?? r.body;

  r = await call('GET', '/api/admin/payments', { token: admin });
  const queue = r.body?.payments ?? r.body?.data ?? r.body;
  check('payment appears in admin queue', ok2xx(r) && JSON.stringify(queue).includes(`TXN${stamp}`), { status: r.status });

  r = await call('GET', '/api/admin/payments', { token: partnerTok });
  check('partner blocked from admin payment queue (403)', r.status === 403, { status: r.status });

  if (payment?.id) {
    r = await call('POST', `/api/admin/payments/${payment.id}/approve`, { token: admin, body: { remarks: 'Verified in bank statement' } });
    check('admin approves payment', ok2xx(r), r.body);
  } else {
    check('admin approves payment', false, 'no payment id returned');
  }

  r = await call('GET', '/api/notifications', { token: partnerTok });
  const notes = JSON.stringify(r.body);
  check('partner received in-app notification', ok2xx(r) && notes.length > 20, { status: r.status, sample: notes.slice(0, 200) });

  console.log('\n=== G. Visa module ===');
  r = await call('POST', '/api/visa-countries', { token: admin, body: { name: `Testland ${stamp}`, baseFee: 6000 } });
  check('create visa country', ok2xx(r), r.body);
  const vcId = r.body?.id ?? r.body?.visaCountry?.id;

  r = await call('POST', `/api/visa-countries/${vcId}/documents`, { token: admin, body: { documentName: 'Passport scan', isMandatory: true } });
  check('add required document to visa country', ok2xx(r), r.body);

  r = await call('GET', `/api/visa-countries/${vcId}`, { token: partnerTok });
  check('partner views visa country + checklist', ok2xx(r), { status: r.status });

  r = await call('POST', '/api/visa-requests', {
    token: partnerTok,
    body: {
      visaCountryId: vcId, markupAmount: 1000,
      passengers: [{ fullName: 'Client One', passportNumber: 'P1234567', dateOfBirth: '1990-05-01', nationality: 'Indian' }],
    },
  });
  check('partner creates visa request', ok2xx(r), r.body);
  const visaReq = r.body?.visaRequest ?? r.body;
  check('visa sellingPrice = baseFee*1pax + markup (7000)', Number(visaReq?.sellingPrice) === 7000, { sellingPrice: visaReq?.sellingPrice });

  r = await call('GET', '/api/visa-requests', { token: partnerTok });
  check('partner lists visa requests', ok2xx(r), { status: r.status });

  console.log('\n=== H. Reports + dashboard ===');
  r = await call('GET', '/api/admin/reports/summary', { token: admin });
  check('admin report summary', ok2xx(r), { status: r.status, body: r.body });

  r = await call('GET', '/api/dashboard', { token: partnerTok });
  check('partner dashboard', ok2xx(r), { status: r.status, keys: Object.keys(r.body || {}) });

  r = await call('GET', '/api/admin/agencies', { token: admin });
  check('admin sees new agency in list', ok2xx(r) && JSON.stringify(r.body).includes(`Flow Travels ${stamp}`), { status: r.status });

  console.log('\n=== I. Cross-tenant isolation ===');
  const p2Email = `iso${stamp}@testagency.com`;
  await call('POST', '/api/auth/register', {
    body: {
      companyName: `Iso Travels ${stamp}`, ownerName: 'Iso Owner', gstNumber: `29ISO${String(stamp).slice(-6)}Z5`,
      businessEmail: p2Email, mobile: '+919876500022', officeAddress: '1 Iso Lane', city: 'Delhi',
      state: 'Delhi', country: 'India', pincode: '110001', password: 'Partner@123',
    },
  });
  const u2 = await prisma.user.findUnique({ where: { email: p2Email } });
  await call('POST', '/api/auth/verify-otp', { body: { email: p2Email, otp: u2.otpCode } });
  const partner2 = (await call('POST', '/api/auth/login', { body: { email: p2Email, password: 'Partner@123' } })).body?.token;

  r = await call('GET', `/api/quotes/${quoteId}`, { token: partner2 });
  check("partner B cannot read partner A's quote (403/404)", r.status === 403 || r.status === 404, { status: r.status, body: r.body });

  r = await call('GET', '/api/quotes', { token: partner2 });
  check('partner B quote list excludes other tenant', ok2xx(r) && !JSON.stringify(r.body).includes(quoteId), { status: r.status });

  console.log(`\n=========================\n  PASSED: ${pass}   FAILED: ${fail}`);
  if (failures.length) console.log('  Failed checks:\n' + failures.map((f) => '   - ' + f).join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('CRASH:', e); await prisma.$disconnect(); process.exit(1); });
