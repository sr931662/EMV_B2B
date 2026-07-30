/*
 * Catches the one class of regression this refactor could realistically introduce and that neither
 * `vite build` nor oxlint reports: a JSX component referenced but never imported/defined. esbuild
 * happily bundles it and it only explodes as a ReferenceError when the user opens that page.
 *
 * For every .jsx file: collect capitalised JSX tag names used, then confirm each one is imported,
 * declared locally, or a member expression on something that is (Table.Row, Skeleton.Text).
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/frontend/src';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

let problems = 0;
let filesChecked = 0;
let tagsChecked = 0;

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  filesChecked += 1;

  // Names brought into scope: imports (default, named, namespace) …
  const available = new Set(['React', 'Fragment']);
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1];
    for (const name of clause.matchAll(/[A-Za-z_$][\w$]*/g)) available.add(name[0]);
  }
  // … plus anything declared in the file itself.
  for (const m of src.matchAll(/(?:function|const|let|class)\s+([A-Z][\w$]*)/g)) available.add(m[1]);

  // Capitalised JSX opening tags, including dotted forms.
  const used = new Set();
  for (const m of src.matchAll(/<([A-Z][\w$]*(?:\.[A-Za-z][\w$]*)*)/g)) used.add(m[1]);

  for (const tag of used) {
    tagsChecked += 1;
    const root = tag.split('.')[0];
    if (!available.has(root)) {
      problems += 1;
      console.log(`MISSING  ${path.relative(ROOT, file).replace(/\\/g, '/')}  ->  <${tag}>`);
    }
  }
}

console.log(`\nChecked ${tagsChecked} JSX tags across ${filesChecked} files.`);
console.log(problems === 0 ? 'OK: every JSX component is in scope.' : `${problems} problem(s) found.`);
process.exitCode = problems === 0 ? 0 : 1;
