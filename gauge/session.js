/* Console + participant DOM wiring. All rendering/stats come from the pure modules. */
import {sessionStats, markdownSummary} from './engine.js';
import {renderForm, collectValues} from './render-form.js';
import {renderOverlay} from './render-overlay.js';
import {startPoll, randomHex} from './relay-client.js';
import {wireExports} from './exports.js';

const ENDED = 'This session has ended — sessions live 24 hours.';
const showOverlay = (el, model, responses, ctx) =>
  { el.innerHTML = renderOverlay(model, sessionStats(model, responses), ctx()); };
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

  let responses = null;

  function renderCounts(data){
    $('ccount').textContent = data.count === 0 ? 'Waiting for responses…'
      : data.count + (data.count === 1 ? ' person has' : ' people have') + ' responded';
    (data.answered || []).forEach((n, i) => { if(counters[i]) counters[i].textContent = String(n); });
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
  }

  const poll = startPoll({
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
      renderCounts(r.data);
      if(r.data.revealed){ showResults(r.data.responses); return false; }   // stop at reveal
      return true;
    },
    onError(){ $('cstate').textContent = 'reconnecting…'; },
  });

  /* two-step reveal: arm, then commit */
  let armed = false, armTimer = null;
  $('creveal').addEventListener('click', async () => {
    if(responses) return;
    if(!armed){
      armed = true;
      $('creveal').textContent = 'Click again to reveal & lock';
      armTimer = setTimeout(() => {
        armed = false;
        $('creveal').textContent = 'Reveal to the room';
      }, 4000);
      return;
    }
    clearTimeout(armTimer);
    const r = await relay.reveal(id, key);
    if(!r.ok){
      armed = false;
      $('creveal').textContent = 'Reveal to the room';
      $('cstate').textContent = r.status === 404 ? ENDED : "Couldn't reveal — try again.";
      return;
    }
    renderCounts(r.data);
    showResults(r.data.responses);
  });

  wireExports({
    buttons: {dlsvg: $('dlsvg2'), dlpng: $('dlpng2'), copypng: $('copypng2'), copymd: $('copymd2')},
    getSvg: () => responses ? renderOverlay(model, sessionStats(model, responses), ctx()) : null,
    getMarkdown: () => responses ? markdownSummary(model, sessionStats(model, responses)) : null,
    slug: () => slugOf(model),
  });
  onThemeChange(() => { if(responses) showOverlay($('coverlay'), model, responses, ctx); });
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

  let lastResponses = null;

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
  const say = msg => { $('pstatus').textContent = msg; };

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
    $('psubmit').disabled = true;
    const r = await relay.submit(id, payload);
    $('psubmit').disabled = false;
    if(r.ok) say('Submitted — you can edit your answers until the facilitator reveals.');
    else if(r.status === 409) say('The facilitator has revealed — responses are locked. View results below.');
    else if(r.status === 404) say(ENDED);
    else say("Couldn't submit — nothing was lost. Check your connection and press Submit again.");
  });

  /* single on-demand GET — participants never poll */
  $('pview').addEventListener('click', async () => {
    const r = await relay.status(id);
    if(r.status === 404) return say(ENDED);
    if(!r.ok) return say("Couldn't reach the relay — try again.");
    if(!r.data.revealed)
      return say('Not revealed yet — ' + r.data.count + ' response' + (r.data.count === 1 ? '' : 's') + ' so far.');
    lastResponses = r.data.responses;
    say('');
    showOverlay($('presult'), model, lastResponses, ctx);
  });

  onThemeChange(() => { if(lastResponses) showOverlay($('presult'), model, lastResponses, ctx); });
}
