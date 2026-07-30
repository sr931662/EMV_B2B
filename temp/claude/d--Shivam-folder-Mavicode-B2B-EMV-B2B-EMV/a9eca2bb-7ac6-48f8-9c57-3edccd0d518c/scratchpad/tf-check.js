/*
 * Lightweight static check for the Terraform config. NOT a substitute for `terraform validate`
 * (not installed here) — it catches the errors most likely to exist in hand-written HCL:
 *
 *   1. unbalanced braces / brackets per file
 *   2. references to resources, data sources, variables or locals that are never declared
 *   3. duplicate resource addresses
 */
const fs = require('fs');
const path = require('path');

const DIR = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/infra';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.tf'));

const declaredResources = new Set(); // "aws_vpc.main"
const declaredData = new Set(); // "data.aws_caller_identity.current"
const declaredVars = new Set();
const declaredLocals = new Set();
const declaredOutputs = new Set();
const seenAddresses = new Map();

let problems = 0;
const report = (msg) => {
  problems += 1;
  console.log(`  ${msg}`);
};

// ---- pass 1: collect declarations -----------------------------------------
const contents = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  contents[f] = src;

  for (const m of src.matchAll(/^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm)) {
    const addr = `${m[1]}.${m[2]}`;
    if (seenAddresses.has(addr)) {
      report(`DUPLICATE resource ${addr} (in ${seenAddresses.get(addr)} and ${f})`);
    }
    seenAddresses.set(addr, f);
    declaredResources.add(addr);
  }
  for (const m of src.matchAll(/^data\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm)) {
    declaredData.add(`data.${m[1]}.${m[2]}`);
  }
  for (const m of src.matchAll(/^variable\s+"([^"]+)"\s*\{/gm)) declaredVars.add(m[1]);
  for (const m of src.matchAll(/^output\s+"([^"]+)"\s*\{/gm)) declaredOutputs.add(m[1]);
}

// locals can appear in multiple `locals {}` blocks; grab top-level keys from each
for (const f of files) {
  const src = contents[f];
  for (const block of src.matchAll(/^locals\s*\{([\s\S]*?)^\}/gm)) {
    for (const line of block[1].split('\n')) {
      const m = line.match(/^\s{2}([a-zA-Z_][\w-]*)\s*=/);
      if (m) declaredLocals.add(m[1]);
    }
  }
}

// ---- pass 2: brace balance -------------------------------------------------
console.log('=== brace / bracket balance ===');
for (const f of files) {
  // Strip comments and strings so braces inside them don't skew the count.
  const cleaned = contents[f]
    .replace(/#[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<<-?EOT[\s\S]*?EOT/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  const counts = (ch) => (cleaned.match(new RegExp(`\\${ch}`, 'g')) || []).length;
  const braces = counts('{') - counts('}');
  const brackets = counts('[') - counts(']');
  const parens = counts('(') - counts(')');

  if (braces || brackets || parens) {
    report(`UNBALANCED ${f}: braces ${braces >= 0 ? '+' : ''}${braces}, brackets ${brackets >= 0 ? '+' : ''}${brackets}, parens ${parens >= 0 ? '+' : ''}${parens}`);
  } else {
    console.log(`  OK  ${f}`);
  }
}

// ---- pass 3: reference resolution -----------------------------------------
console.log('\n=== reference resolution ===');
const KNOWN_PREFIXES = new Set(['each', 'count', 'self', 'path', 'terraform']);

for (const f of files) {
  const src = contents[f]
    .replace(/#[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '');

  // var.x
  for (const m of src.matchAll(/\bvar\.([a-zA-Z_][\w-]*)/g)) {
    if (!declaredVars.has(m[1])) report(`${f}: undeclared var.${m[1]}`);
  }
  // local.x
  for (const m of src.matchAll(/\blocal\.([a-zA-Z_][\w-]*)/g)) {
    if (!declaredLocals.has(m[1])) report(`${f}: undeclared local.${m[1]}`);
  }
  // data.type.name
  for (const m of src.matchAll(/\bdata\.([a-z0-9_]+)\.([a-zA-Z_][\w-]*)/g)) {
    const addr = `data.${m[1]}.${m[2]}`;
    if (!declaredData.has(addr)) report(`${f}: undeclared ${addr}`);
  }
  // aws_*.name  (resource references; skip the declaration lines themselves)
  for (const m of src.matchAll(/(?<!")\b((?:aws|random)_[a-z0-9_]+)\.([a-zA-Z_][\w-]*)/g)) {
    const addr = `${m[1]}.${m[2]}`;
    // "data.aws_x.y" already handled above — skip when preceded by "data."
    const idx = m.index ?? 0;
    if (src.slice(Math.max(0, idx - 5), idx) === 'data.') continue;
    if (!declaredResources.has(addr)) report(`${f}: undeclared resource ${addr}`);
  }
}

console.log(`\n=== summary ===`);
console.log(`  files            : ${files.length}`);
console.log(`  resources        : ${declaredResources.size}`);
console.log(`  data sources     : ${declaredData.size}`);
console.log(`  variables        : ${declaredVars.size}`);
console.log(`  locals           : ${declaredLocals.size}`);
console.log(`  outputs          : ${declaredOutputs.size}`);
console.log(problems === 0 ? '\nOK: no structural problems found.' : `\n${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
