import {escapeHtml} from './utils.js?v=0.21.0';

// Reuse the caller's existing dialog and focus restoration. Clipboard denial
// leaves the complete note available, including in an offline or insecure tab.
export async function copyDecisionNote(text,{open,toast}) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Decision note copied.');
    return true;
  } catch {
    open(`<p>Clipboard access is unavailable. Copy the selected note below.</p><div class="field"><label for="decision-note-copy">Decision note</label><textarea id="decision-note-copy" rows="12" readonly>${escapeHtml(text)}</textarea></div>`,'Copy decision note');
    const field=document.getElementById('decision-note-copy');
    field.style.maxHeight='55vh';
    field.style.overflowY='auto';
    field.focus();
    field.select();
    return false;
  }
}
