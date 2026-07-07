/* Console + participant DOM wiring. All rendering/stats come from the pure modules. */
import {sessionStats, markdownSummary, mergeFinal, delphiStats, countLabel} from './engine.js';
import {fermiHandoff} from './handoff.js';
import {renderForm, collectValues} from './render-form.js';
import {renderOverlay} from './render-overlay.js';
import {startPoll, randomHex} from './relay-client.js';
import {wireExports} from '../assets/exports.js';

const ENDED = 'This session has ended — sessions live 24 hours.';
const showOverlay = (el, model, responses, ctx) =>
  { el.innerHTML = renderOverlay(model, sessionStats(model, responses), ctx()); };
const delphiSvg = (model, r1, r2, ctx) =>
  renderOverlay(model, sessionStats(model, mergeFinal(r1, r2)), ctx(),
    {delphi: delphiStats(model, r1, r2), round1: sessionStats(model, r1)});
const delphiMd = (model, r1, r2) =>
  markdownSummary(model, sessionStats(model, mergeFinal(r1, r2)), delphiStats(model, r1, r2));
const onThemeChange = fn => {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement,
    {attributes: true, attributeFilter: ['data-theme']});
};
const slugOf = model => ((model.title || 'gauge')).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function initConsole({model, text, relay, ctx, $, encodeState, id, key}){
  $('ctitle').textContent = model.title || 'Gauge session';
  const joinUrl = location.origin + location.pathname + '#' + encodeState({t: text, id});
  $('joinlink').value = joinUrl;
  $('copylink').addEventListener('click', () => {
    if(navigator.clipboard) navigator.clipboard.writeText(joinUrl).catch(() => {});
    $('copylink').textContent = 'Copied';
    setTimeout(() => { $('copylink').textContent = 'Copy'; }, 1800);
  });

  const counters = model.questions.map((q, i) => {
    const li = document.createElement('li');
    li.textContent = (i + 1) + '. ' + q.text + ' — ';
    const b = document.createElement('b');
    b.textContent = '0';
    li.appendChild(b);
    li.append(' answered');
    $('cquestions').appendChild(li);
    return b;
  });

  let responses = null, responses2 = null, round = 1, poll2 = null;

  function renderCounts(data){
    $('ccount').textContent = countLabel(round, data);
    const answered = round === 2 ? data.answered2 : data.answered;
    (answered || []).forEach((n, i) => { if(counters[i]) counters[i].textContent = String(n); });
  }
  function showResults(resp){
    responses = resp;
    poll.stop();
    $('creveal').disabled = true;
    $('creveal').textContent = 'Revealed — responses locked';
    $('cstate').textContent = '';
    $('cquestions').hidden = true;
    showOverlay($('coverlay'), model, responses, ctx);
    $('cexports').hidden = false;
    $('cround2wrap').hidden = false;
    refreshHandoff();
  }
  function showResults2(r1resp, r2resp){
    responses = r1resp;
    responses2 = r2resp;
    if(poll2) poll2.stop();
    $('creveal').disabled = true;
    $('creveal').textContent = 'Round 2 revealed — locked';
    $('cstate').textContent = '';
    $('cquestions').hidden = true;
    $('coverlay').innerHTML = delphiSvg(model, responses, responses2, ctx);
    refreshHandoff();
  }

  const mkPoll = () => startPoll({
    tick: async () => {
      const r = await relay.status(id);
      if(r.status === 0 || r.status >= 500) throw new Error('poll failed');
      return r;
    },
    onUpdate(r){
      if(r.status === 404){
        $('ccount').textContent = ENDED;
        $('creveal').disabled = true;
        return false;
      }
      $('cstate').textContent = '';
      if(round === 1 && r.data.round === 2){
        /* console reloaded mid-round-2: restore state from the relay */
        round = 2;
        responses = r.data.responses || responses;
        if(responses) showOverlay($('coverlay'), model, responses, ctx);
        $('cexports').hidden = false;
        $('cround2wrap').hidden = true;
        $('cquestions').hidden = false;
        $('creveal').disabled = false;
        $('creveal').textContent = 'Reveal round 2';
      }
      renderCounts(r.data);
      if(round === 2){
        if(r.data.revealed2){ showResults2(r.data.responses, r.data.responses2); return false; }
        return true;
      }
      if(r.data.revealed){ showResults(r.data.responses); return false; }   // stop at reveal
      return true;
    },
    onError(){ $('cstate').textContent = 'reconnecting…'; },
  });
  const poll = mkPoll();

  /* two-step reveal: arm, then commit (works for whichever round is live) */
  let armed = false, armTimer = null;
  $('creveal').addEventListener('click', async () => {
    if(round === 2 ? responses2 : responses) return;
    const label = round === 2 ? 'Reveal round 2' : 'Reveal to the room';
    if(!armed){
      armed = true;
      $('creveal').textContent = 'Click again to reveal & lock';
      armTimer = setTimeout(() => {
        armed = false;
        $('creveal').textContent = label;
      }, 4000);
      return;
    }
    clearTimeout(armTimer);
    armed = false;
    const r = await relay.reveal(id, key);
    if(!r.ok){
      $('creveal').textContent = label;
      $('cstate').textContent = r.status === 404 ? ENDED : "Couldn't reveal — try again.";
      return;
    }
    renderCounts(r.data);
    if(round === 2) showResults2(r.data.responses, r.data.responses2);
    else showResults(r.data.responses);
  });

  /* Delphi round 2: same two-step arm as reveal/end */
  let r2Armed = false, r2Timer = null;
  $('cround2').addEventListener('click', async () => {
    if(round === 2) return;
    if(!r2Armed){
      r2Armed = true;
      $('cround2').textContent = 'Click again to open round 2';
      r2Timer = setTimeout(() => {
        r2Armed = false;
        $('cround2').textContent = 'Open a second round (Delphi)';
      }, 4000);
      return;
    }
    clearTimeout(r2Timer);
    const r = await relay.round2(id, key);
    if(!r.ok){
      r2Armed = false;
      $('cround2').textContent = 'Open a second round (Delphi)';
      $('cstate').textContent = r.status === 404 ? ENDED : "Couldn't open round 2 — try again.";
      return;
    }
    round = 2;
    $('cround2wrap').hidden = true;
    $('cquestions').hidden = false;
    counters.forEach(b => { b.textContent = '0'; });
    $('ccount').textContent = 'Round 2 open — tell the room to revise and resubmit.';
    $('creveal').disabled = false;
    $('creveal').textContent = 'Reveal round 2';
    poll2 = mkPoll();
  });

  /* #93: the room's ranges → prefilled fermi variables */
  function currentHandoff(){
    if(responses2)
      return fermiHandoff(model, sessionStats(model, mergeFinal(responses, responses2)),
        delphiStats(model, responses, responses2));
    return responses ? fermiHandoff(model, sessionStats(model, responses)) : null;
  }
  function refreshHandoff(){ $('tofermi').hidden = !currentHandoff(); }
  $('tofermi').addEventListener('click', () => {
    const h = currentHandoff();
    if(h) location.href = '/fermi/#' + btoa(unescape(encodeURIComponent(JSON.stringify(h))));
  });

  wireExports({
    buttons: {dlsvg: $('dlsvg2'), dlpng: $('dlpng2'), copypng: $('copypng2'), copymd: $('copymd2')},
    getSvg: () => responses2 ? delphiSvg(model, responses, responses2, ctx)
      : responses ? renderOverlay(model, sessionStats(model, responses), ctx()) : null,
    getMarkdown: () => responses2 ? delphiMd(model, responses, responses2)
      : responses ? markdownSummary(model, sessionStats(model, responses)) : null,
    slug: () => slugOf(model) + (responses2 ? '-delphi' : ''),
  });

  /* end session early: same two-step arm; deletes the relay entry, exports stay usable */
  let endArmed = false, endTimer = null;
  $('cend').addEventListener('click', async () => {
    if(!endArmed){
      endArmed = true;
      $('cend').textContent = 'Click again to delete responses';
      endTimer = setTimeout(() => {
        endArmed = false;
        $('cend').textContent = 'End session now';
      }, 4000);
      return;
    }
    clearTimeout(endTimer);
    const r = await relay.end(id, key);
    if(!r.ok && r.status !== 404){
      endArmed = false;
      $('cend').textContent = 'End session now';
      $('cstate').textContent = "Couldn't end the session — try again.";
      return;
    }
    $('cend').disabled = true;
    $('cend').textContent = 'Session ended';
    $('cstate').textContent = 'Responses deleted from the relay — exports still work from this tab.';
  });

  onThemeChange(() => {
    if(responses2) $('coverlay').innerHTML = delphiSvg(model, responses, responses2, ctx);
    else if(responses) showOverlay($('coverlay'), model, responses, ctx);
  });
}

export function initParticipant({model, relay, ctx, $, id, wireFormEvents}){
  $('ptitle').textContent = model.title || 'Gauge session';
  $('pform').innerHTML = renderForm(model);
  wireFormEvents($('pform'));

  let pid = null;
  try{ pid = localStorage.getItem('gauge-pid-' + id); }catch(e){}
  if(!pid){
    pid = randomHex(16);
    try{ localStorage.setItem('gauge-pid-' + id, pid); }catch(e){}
  }

  let lastResponses = null, lastDelphi = null;

  const readFields = () => [...$('pform').querySelectorAll('input[data-part]')].map(el => ({
    q: +el.closest('.q').dataset.q,
    part: el.dataset.part,
    value: el.value,
    touched: el.dataset.touched === '1',
  }));
  function markErrors(errors){
    for(const qEl of $('pform').querySelectorAll('.q[data-q]')){
      const err = errors.find(e => e.q === +qEl.dataset.q);
      const line = qEl.querySelector('.qerr');
      if(line){ line.hidden = !err; line.textContent = err ? err.msg : ''; }
      qEl.classList.toggle('haserr', !!err);
    }
  }
  const say = (msg, tone) => {
    const el = $('pstatus');
    el.textContent = msg;
    el.classList.toggle('ok', tone === 'ok');
    el.classList.toggle('err', tone === 'err');
  };

  $('psubmit').addEventListener('click', async () => {
    const {values, errors, answered} = collectValues(model, readFields());
    markErrors(errors);
    $('perr').hidden = true;
    if(errors.length) return;
    if(!answered){
      $('perr').textContent = 'Answer at least one question before submitting.';
      $('perr').hidden = false;
      return;
    }
    const payload = {participantId: pid, values};
    if(model.names){
      const name = ($('pform').querySelector('[data-name]') || {value: ''}).value.trim();
      if(!name){
        $('perr').textContent = 'This session asks for your name.';
        $('perr').hidden = false;
        return;
      }
      payload.name = name;
    }
    const btn = $('psubmit');
    btn.disabled = true;
    const r = await relay.submit(id, payload);
    btn.disabled = false;
    if(r.ok){
      say('✓ Submitted — you can edit your answers until the facilitator reveals.', 'ok');
      btn.textContent = '✓ Submitted';
      setTimeout(() => { btn.textContent = 'Update answers'; }, 1600);
    }
    else if(r.status === 409) say('Responses are locked for this round — if the facilitator opens a second round, Submit works again. View results below.', 'err');
    else if(r.status === 404) say(ENDED, 'err');
    else say("Couldn't submit — nothing was lost. Check your connection and press Submit again.", 'err');
  });

  /* single on-demand GET — participants never poll */
  $('pview').addEventListener('click', async () => {
    const r = await relay.status(id);
    if(r.status === 404) return say(ENDED);
    if(!r.ok) return say("Couldn't reach the relay — try again.");
    if(!r.data.revealed)
      return say('Not revealed yet — ' + r.data.count + ' response' + (r.data.count === 1 ? '' : 's') + ' so far.');
    if(r.data.round === 2 && r.data.revealed2){
      lastDelphi = {r1: r.data.responses, r2: r.data.responses2};
      lastResponses = null;
      say('');
      $('presult').innerHTML = delphiSvg(model, lastDelphi.r1, lastDelphi.r2, ctx);
      return;
    }
    lastResponses = r.data.responses;
    lastDelphi = null;
    say(r.data.round === 2
      ? 'Round 2 is open — the round-1 spread is below. Revise your answers above and press Submit again (or keep them: they carry forward).'
      : '');
    showOverlay($('presult'), model, lastResponses, ctx);
  });

  onThemeChange(() => {
    if(lastDelphi) $('presult').innerHTML = delphiSvg(model, lastDelphi.r1, lastDelphi.r2, ctx);
    else if(lastResponses) showOverlay($('presult'), model, lastResponses, ctx);
  });
}
