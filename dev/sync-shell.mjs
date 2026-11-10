/* Stamps the shared tool header (title row, File menu, Share) into every page whose
   manifest entry has shell:true, between <!-- shell:start --> and <!-- shell:end -->
   inside <header data-tool-header>, plus the stylesheet and module in <head>.
   Static HTML decided by dev/shell-manifest.mjs; scripts only attach behaviour.
   Pages with shell:false are never touched. `--check` reports drift. */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {SHELL_MANIFEST} from './shell-manifest.mjs';
import {TOOL_DIRS} from './tool-dirs.mjs';
import {SOURCE_TOOLS} from '../assets/saved-work-keys.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/* Every control ships disabled: the shell enables each one as its capability arrives, so one
   that cannot work says so, including when the shell or the page script never loads. */
const button = (act, label, extra = '') => `<button type="button" data-act="${act}"${extra} disabled>${label}</button>`;

/* The File menu, in the spec's order, each item only where the manifest grants it.
   Every page gets Your work and Save a copy, so File is always present. */
export function shellRegion(dir, entry){
  const items = [
    '<p class="tool-stalled">This page did not finish loading. Reload to save or share.</p>',
    ...(SOURCE_TOOLS.includes(dir) ? ['<p class="tool-note">Draft saved in this browser</p>'] : []),
    ...(entry.new ? [button('new', 'New')] : entry.templates ? [button('new-template', 'New from template…')] : []),
    ...(entry.examples ? [button('examples', 'Examples', ' aria-expanded="false"'), '<div class="tool-examples" data-shell-examples-list hidden></div>'] : []),
    button('work', 'Your work…'),
    button('save', 'Save a copy…'),
    ...(entry.templates ? [button('template', 'Save as template…')] : []),
    ...entry.items.map(item => button('item', esc(item.label), ` data-item="${item.id}"`)),
    '<a href="/backup/" data-act="backup">Backup &amp; restore</a>',
  ];
  return `<!-- shell:start -->
    <div class="tool-titlerow" data-shell-row${entry.workspaces ? ` data-workspaces="${esc(entry.workspaces)}"` : ''}${entry.longName ? ' data-long-name' : ''}>
      <h1>${esc(entry.name)}</h1>
      <details class="tool-file" data-shell-file>
        <summary>File</summary>
        <div class="tool-menu">
          ${items.join('\n          ')}
        </div>
      </details>${entry.share ? '\n      ' + button('share', 'Share', ' class="tool-share"') : ''}
      <p class="tool-status" role="status"></p>
    </div>
    <!-- shell:end -->`;
}
export const headBlock = `<!-- shell:head:start -->
<link rel="stylesheet" href="/assets/tool-shell.css">
<script type="module" src="/assets/tool-shell.js"></script>
<!-- shell:head:end -->`;

function stamp(html, dir, entry){
  const region = /<!-- shell:start -->[\s\S]*?<!-- shell:end -->/, head = /<!-- shell:head:start -->[\s\S]*?<!-- shell:head:end -->/;
  if(!entry.shell){
    if(/<!-- shell:(?:head:)?(?:start|end) -->/.test(html)) throw Error(dir + ': has shell markers but its manifest entry has shell:false');
    return html;
  }
  if(!/<header data-tool-header/.test(html)) throw Error(dir + ': no <header data-tool-header> to stamp (run dev/sync-identity.mjs first)');
  html = html.replace(/<header data-tool-header(?: data-shell)?/, '<header data-tool-header data-shell');
  if(region.test(html)) html = html.replace(region, shellRegion(dir, entry));
  else if(check) throw Error(dir + ': shell:true but the header has no shell markers; run npm run sync');
  else html = html.replace(/(<header data-tool-header[^>]*>)([\s\S]*?)(\s*<\/header>)/, (_, open, inner, close) => open + inner + '\n    ' + shellRegion(dir, entry) + close);
  if(head.test(html)) html = html.replace(head, headBlock);
  else html = html.replace('</head>', headBlock + '\n</head>');
  return html;
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  let changed = 0;
  for(const [dir, entry] of Object.entries(SHELL_MANIFEST)){
    const path = join(root, TOOL_DIRS.includes(dir) ? dir : 'energy/' + dir, 'index.html');
    if(!existsSync(path)) throw Error('Missing page: ' + path);
    const before = readFileSync(path, 'utf8'), after = stamp(before, dir, entry);
    if(after === before) continue;
    if(check) throw Error(`${path}: shell region drift; run npm run sync`);
    writeFileSync(path, after); changed++;
  }
  console.log(check ? 'Shell regions are current.' : `Shell regions stamped (${changed} page${changed === 1 ? '' : 's'} changed).`);
}
