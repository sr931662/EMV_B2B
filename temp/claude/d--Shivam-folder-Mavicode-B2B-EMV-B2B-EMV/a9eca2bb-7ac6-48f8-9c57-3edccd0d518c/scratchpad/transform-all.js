// Ask the running Vite dev server to transform every source module. A syntax error, a bad import
// specifier or an unresolvable path comes back as a non-200, which is a stronger signal than the
// production build alone (and mirrors exactly what the browser will request).
const fs = require('fs');
const path = require('path');

const ROOT = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/frontend';
const SRC = path.join(ROOT, 'src');
const BASE = 'http://localhost:5173';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

(async () => {
  const files = walk(SRC);
  const failures = [];

  for (const file of files) {
    const rel = '/' + path.relative(ROOT, file).replace(/\\/g, '/');
    try {
      const res = await fetch(BASE + rel);
      if (!res.ok) {
        const body = await res.text();
        failures.push({ rel, status: res.status, body: body.slice(0, 300) });
      }
    } catch (e) {
      failures.push({ rel, status: 'FETCH_FAIL', body: String(e).slice(0, 200) });
    }
  }

  console.log(`Transformed ${files.length} modules via Vite.`);
  if (failures.length === 0) {
    console.log('OK: every module compiles.');
  } else {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  ${f.rel}  [${f.status}]\n    ${f.body}\n`));
    process.exitCode = 1;
  }
})();
