/* npm run export:sheets [-- --doc long-text --tool roadmap --out <dir>]
   Renders the export contact sheets for a human to read: every export of the chosen documents (default: the built-in
   examples and the long-text, dense and awkward-text stress documents, light) captured through the real buttons and laid
   out side by side, plus the findings. A thin wrapper over the full audit (export-audit.mjs); open <out>/sheets. */
import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const has = name => args.includes('--' + name);
const out = has('out') ? args[args.indexOf('--out') + 1] : mkdtempSync(join(tmpdir(), 'export-sheets-'));
const forward = [...args];
if(!has('doc')) forward.push('--doc', 'example,long-text,dense,awkward-text');
if(!has('theme')) forward.push('--theme', 'light');
if(!has('out')) forward.push('--out', out);
if(!has('phase')) forward.push('--phase', 'capture,analyse,sheets');
const run = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'export-audit.mjs'), ...forward], {stdio: 'inherit'});
console.log(`\nContact sheets: ${out}/sheets`);
process.exit(run.status ?? 1);
