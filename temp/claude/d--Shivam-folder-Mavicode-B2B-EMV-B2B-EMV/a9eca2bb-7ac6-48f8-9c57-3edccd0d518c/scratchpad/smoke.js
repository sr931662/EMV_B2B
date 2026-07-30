// End-to-end smoke test against the running backend + Neon DB.
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
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else {
    fail++; failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` -> ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

(async () => {
  console.log('\n=== 1. Health + auth ===');
  let r = await call('GET', '/health');
  check('GET /health', r.status === 200 && r.body?.status === 'ok', r.body);

  r = await call('POST', '/api/auth/login', { body: { email: 'admin@emv.com', password: 'Admin@123' } });
  check('admin login (seeded creds)', r.status === 200 && !!r.body?.token, r.body);
  const adminToken = r.body?.token;
  if (!adminToken) { console.log('\nAborting: no admin token.'); process.exit(1); }

  r = await call('POST', '/api/auth/login', { body: { email: 'admin@emv.com', password: 'WrongPass1' } });
  check('login rejects wrong password (401)', r.status === 401, r.body);

  r = await call('GET', '/api/auth/me', { token: adminToken });
  check('GET /api/auth/me returns admin role', r.status === 200 && r.body?.role === 'admin', r.body);

  r = await call('GET', '/api/auth/me');
  check('protected route without token -> 401', r.status === 401, r.body);

  console.log('\n=== 2. Partner registration + OTP ===');
  const stamp = Date.now();
  const partnerEmail = `smoke${stamp}@testagency.com`;
  const partnerPassword = 'Partner@123';
  r = await call('POST', '/api/auth/register', {
    body: {
      companyName: `Smoke Travels ${stamp}`, ownerName: 'Test Owner',
      gstNumber: `29ABCDE${String(stamp).slice(-4)}F1Z5`, businessEmail: partnerEmail,
      mobile: '+919876543210', officeAddress: '12 Test Street', city: 'Bengaluru',
      state: 'Karnataka', country: 'India', pincode: '560001', password: partnerPassword,
    },
  });
  check('partner register', r.status === 201 || r.status === 200, r.body);

  r = await call('POST', '/api/auth/login', { body: { email: partnerEmail, password: partnerPassword } });
  check('unverified partner cannot log in', r.status >= 400, r.body);

  console.log('\n=== 3. Admin data libraries (CRUD) ===');
  r = await call('POST', '/api/destinations', { token: adminToken, body: { name: `Goa ${stamp}`, country: 'India' } });
  check('create destination', r.status === 201 || r.status === 200, r.body);
  const destId = r.body?.id || r.body?.destination?.id;

  r = await call('GET', '/api/destinations', { token: adminToken });
  check('list destinations', r.status === 200, r.body);

  r = await call('GET', '/api/hotels', { token: adminToken });
  check('list hotels', r.status === 200, r.body);

  r = await call('GET', '/api/day-templates', { token: adminToken });
  check('list day templates', r.status === 200, r.body);

  r = await call('GET', '/api/packages', { token: adminToken });
  check('list packages', r.status === 200, r.body);

  console.log('\n=== 4. Visa module ===');
  r = await call('POST', '/api/visa-countries', {
    token: adminToken,
    body: { name: `Testland ${stamp}`, processingTime: '5-7 working days', visaFee: 5000, serviceFee: 1000 },
  });
  check('create visa country', r.status === 201 || r.status === 200, r.body);

  r = await call('GET', '/api/visa-countries', { token: adminToken });
  check('list visa countries', r.status === 200, r.body);

  r = await call('GET', '/api/admin/visa-requests', { token: adminToken });
  check('admin visa request queue', r.status === 200, r.body);

  console.log('\n=== 5. Admin CMS + payments + reports ===');
  for (const [label, path] of [
    ['admin payment queue', '/api/admin/payments'],
    ['admin agencies', '/api/admin/agencies'],
    ['admin users', '/api/admin/users'],
    ['admin email templates', '/api/admin/email-templates'],
    ['admin reports', '/api/admin/reports'],
    ['notifications', '/api/notifications'],
  ]) {
    r = await call('GET', path, { token: adminToken });
    check(`GET ${label}`, r.status === 200, { status: r.status, body: r.body });
  }

  console.log('\n=== 6. Role guards ===');
  r = await call('GET', '/api/admin/users');
  check('admin route without token -> 401', r.status === 401, r.body);

  r = await call('GET', '/api/dashboard', { token: adminToken });
  check('partner-only dashboard blocks admin (403)', r.status === 403, { status: r.status, body: r.body });

  console.log(`\n=========================\n  PASSED: ${pass}   FAILED: ${fail}`);
  if (failures.length) console.log('  Failed checks:\n' + failures.map(f => '   - ' + f).join('\n'));
})();
