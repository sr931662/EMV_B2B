// Character-by-character depth tracer: reports depth at the end of every line so an imbalance can
// be located precisely, instead of guessing from a whole-file count.
const fs = require('fs');

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

let brace = 0;
let bracket = 0;
let paren = 0;
let inString = false;
let escaped = false;

const suspicious = [];

lines.forEach((line, i) => {
  const before = { brace, bracket, paren };

  for (let c = 0; c < line.length; c += 1) {
    const ch = line[c];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    // Comment runs to end of line (outside a string).
    if (ch === '#') break;
    if (ch === '/' && line[c + 1] === '/') break;

    if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
  }

  if (brace < 0 || bracket < 0 || paren < 0) {
    suspicious.push(`line ${i + 1}: NEGATIVE depth  brace=${brace} bracket=${bracket} paren=${paren}  | ${line.trim().slice(0, 90)}`);
  }
  // A top-level block should close back to 0.
  if (before.brace > 0 && brace === 0 && bracket === 0 && paren === 0) {
    // block closed cleanly — nothing to report
  }
});

console.log(`${file}`);
console.log(`  final: brace=${brace} bracket=${bracket} paren=${paren} inString=${inString}`);
suspicious.slice(0, 10).forEach((s) => console.log('  ' + s));
console.log(brace === 0 && bracket === 0 && paren === 0 && !inString ? '  BALANCED' : '  IMBALANCE');
