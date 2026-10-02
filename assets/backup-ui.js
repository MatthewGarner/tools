import {MAX_BACKUP_BYTES, exportArchive, parseArchive, previewImport, recoveryArchive, serializeArchive, applyImport, assertUnchanged, readOwned, isOwnedKey, keyLabel} from './backup-store.js';

const $ = id => document.getElementById(id);
let plan, selectedArchive, recovery, downloadRequested = false, fileRevision = 0, stale = false;
const downloads = new Set();
$('origin').textContent = location.origin;
const metadata = () => ({origin:location.origin});
const store = () => localStorage; // Access can itself throw when storage is blocked.
function status(message, error = false, focus = false) {
  $('status').textContent = message;
  $('status').toggleAttribute('data-error', error);
  if(focus) $('status').focus();
}
function refreshLocal() {
  try {
    const count = readOwned(store()).length;
    $('local-summary').textContent = count ? `${count} saved ${count === 1 ? 'item' : 'items'} available here.` : 'No saved work found on this address in this browser.';
    $('download').disabled = !count;
  } catch(error) { $('local-summary').textContent = 'Saved work is unavailable in this browser.'; $('download').disabled = true; status(error.message, true); }
}
function download(archive, prefix) {
  const url = URL.createObjectURL(new Blob([serializeArchive(archive)], {type:'application/json'}));
  downloads.add(url);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 30000); }
}
addEventListener('pagehide', () => { for(const url of downloads) URL.revokeObjectURL(url); downloads.clear(); });
$('download').addEventListener('click', () => {
  try { download(exportArchive(store(), metadata()), 'saved-work'); status('Download requested. Check that the file was saved.'); }
  catch(error) { status(error.message, true); }
});
const replacing = () => document.querySelector('input[name="conflicts"]:checked').value === 'replace';
function updateChoices() {
  if(!plan) return;
  const replace = replacing();
  const conflicts = plan.rows.filter(row => row.status === 'conflict').length;
  const added = plan.rows.filter(row => row.status === 'add').length;
  const unchanged = plan.rows.filter(row => row.status === 'same').length;
  const count = added + (replace ? conflicts : 0);
  $('recovery-step').hidden = !replace || !conflicts;
  $('apply').disabled = stale || count === 0 || (replace && conflicts > 0 && !(downloadRequested && $('recovery-confirmed').checked));
  $('apply').textContent = replace && conflicts ? `Import and replace ${count} ${count === 1 ? 'item' : 'items'}` : `Import ${count} new ${count === 1 ? 'item' : 'items'}`;
  $('import-count').textContent = `${added} new · ${conflicts} ${replace ? 'to replace' : 'kept here'} · ${unchanged} already identical`;
  for(const label of $('import-list').querySelectorAll('[data-conflict]')) label.textContent = replace ? 'Replace with file version' : 'Keep this browser’s version';
}
function buildPreview() {
  plan = previewImport(store(), selectedArchive);
  recovery = recoveryArchive(plan, metadata());
  stale = false; downloadRequested = false;
  $('recovery-confirmed').checked = false;
  $('recovery-confirmed').disabled = true;
  document.querySelector('input[value="preserve"]').checked = true;
  $('recovery-problem').hidden = true;
  $('file-summary').textContent = `${plan.rows.length} saved items from ${plan.origin} · ${new Date(plan.createdAt).toLocaleString()}`;
  $('import-list').replaceChildren(...plan.rows.map(row => {
    const item = document.createElement('li'), name = document.createElement('span'), key = document.createElement('small'), outcome = document.createElement('span');
    name.className = 'backup-item-name'; name.textContent = row.name;
    key.className = 'backup-item-key'; key.textContent = row.key; name.append(key);
    outcome.className = 'backup-item-status'; outcome.textContent = row.status === 'same' ? 'Already identical' : 'Add new item';
    if(row.status === 'conflict') outcome.dataset.conflict = '';
    item.append(name, outcome); return item;
  }));
  $('register-note').hidden = !plan.registerConflict;
  $('conflict-choice').hidden = !plan.rows.some(row => row.status === 'conflict');
  $('preview').hidden = false;
  updateChoices();
  status('Preview ready. No saved work has changed.');
  $('preview-heading').focus();
}
$('backup-file').addEventListener('change', async event => {
  const revision = ++fileRevision;
  const file = event.target.files[0];
  plan = null; selectedArchive = null; $('preview').hidden = true;
  if(!file) return;
  try {
    if(file.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON backup smaller than 20 MB.');
    const text = await file.text();
    if(revision !== fileRevision) return;
    selectedArchive = parseArchive(text);
    buildPreview();
  } catch(error) { if(revision === fileRevision) status(error.message, true, true); }
});
for(const radio of document.querySelectorAll('input[name="conflicts"]')) radio.addEventListener('change', updateChoices);
$('recovery-confirmed').addEventListener('change', updateChoices);
$('download-recovery').addEventListener('click', () => {
  try {
    assertUnchanged(store(), plan);
    download(recovery, 'before-import');
    downloadRequested = true; $('recovery-confirmed').disabled = false;
    status('Download requested. Confirm that you saved the pre-import file before replacing work.');
    updateChoices(); $('recovery-confirmed').focus();
  } catch(error) { stale = true; updateChoices(); status(error.message, true, true); }
});
$('download-failed-recovery').addEventListener('click', () => {
  try { download(recovery, 'before-import'); status('Recovery download requested. Keep this file and the original import file.'); }
  catch(error) { status(error.message, true, true); }
});
$('refresh-preview').addEventListener('click', () => { try { buildPreview(); } catch(error) { stale = true; updateChoices(); status(error.message, true, true); } });
$('cancel').addEventListener('click', () => {
  ++fileRevision; plan = null; selectedArchive = null; $('preview').hidden = true; $('backup-file').value = ''; status('Import cancelled.'); $('backup-file').focus();
});
$('apply').addEventListener('click', () => {
  if(!plan || stale) return;
  try {
    const result = applyImport(store(), plan, {replace:replacing(), backupDownloaded:downloadRequested && $('recovery-confirmed').checked});
    plan = null; $('preview').hidden = true; $('backup-file').value = ''; refreshLocal();
    status(`Imported ${result.imported} ${result.imported === 1 ? 'item' : 'items'}. ${result.preserved ? `Kept ${result.preserved} existing items. ` : ''}Reopen your tools to use the saved work.`, false, true);
  } catch(error) {
    stale = true; updateChoices();
    if(error.rollbackFailed?.length) {
      $('recovery-problem').hidden = false;
      $('recovery-list').replaceChildren(...error.rollbackFailed.map(key => { const item = document.createElement('li'); item.textContent = keyLabel(key, '') + ` (${key})`; return item; }));
    }
    status(error.message, true, true);
  }
});
addEventListener('storage', event => {
  if(event.key !== null && !isOwnedKey(event.key)) return;
  refreshLocal();
  if(plan) { stale = true; updateChoices(); status('Saved work changed in another tab. Preview the file again before importing.', true); }
});
refreshLocal();
