// Harmonise leftover page <h1> typography with PageHeader's, so every screen's title matches.
// Only touches <h1 ...> tags — PackageDetailPage also uses text-2xl on a <p> price, which must
// keep its own size.
const fs = require('fs');
const path = require('path');

const ROOT = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/frontend/src';
const OLD = 'text-2xl font-semibold text-neutral-900';
const NEW = 'text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]';

// Also lift the ad-hoc "&larr; Back to X" links to the same treatment PageHeader uses.
const OLD_BACK = 'text-sm font-medium text-primary-600 hover:text-primary-700';
const NEW_BACK =
  '-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

let h1Count = 0;
let backCount = 0;
const touched = [];

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;

  // <h1 className="…"> only. Handles the attribute appearing on the same line as the tag.
  next = next.replace(
    /(<h1\s+className=")([^"]*)(")/g,
    (match, open, classes, close) => {
      if (!classes.includes(OLD)) return match;
      h1Count += 1;
      return open + classes.replace(OLD, NEW) + close;
    }
  );

  // Back links: only the ones whose text content is a "&larr; Back …" label.
  next = next.replace(
    /(<Link\b[^>]*className=")([^"]*)("[^>]*>\s*(?:\{'\s*'\}\s*)?&larr;)/g,
    (match, open, classes, tail) => {
      if (!classes.includes(OLD_BACK)) return match;
      backCount += 1;
      return open + classes.replace(OLD_BACK, NEW_BACK) + tail;
    }
  );

  if (next !== original) {
    fs.writeFileSync(file, next);
    touched.push(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
}

console.log(`h1 titles harmonised: ${h1Count}`);
console.log(`back links harmonised: ${backCount}`);
console.log(`files touched (${touched.length}):`);
touched.forEach((f) => console.log('  ' + f));
