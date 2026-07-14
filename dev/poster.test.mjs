/* The poster frame composes around a chart it has to MEASURE: posterSvg reads the
   embedded chart's natural box out of its root <svg> with a regex, and falls back to
   900×400 if it can't. That fallback is silent, and a silent wrong size doesn't throw
   — it lays the footer down on top of the chart and ships a broken artifact into
   someone's deck. It bit us once already: cycles and risk emit single-quoted
   width/height (their own XML-discipline convention) and the regex only accepted
   double quotes.

   So: pin the contract instead of trusting it. Every poster golden must carry a chart
   whose dimensions posterSvg can actually read, and the frame must be at least as
   tall as the chart it wraps (which is exactly what the fallback got wrong). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';

const DIR = new URL('./golden/', import.meta.url);
const DIMS = /width=['"](\d+)['"] height=['"](\d+)['"]/;   // must match assets/poster.js's chartDims

const posters = readdirSync(DIR).filter(f => f.endsWith('-poster.svg'));

test('there are poster goldens to check', () => {
  assert.ok(posters.length >= 3, 'expected the poster goldens; found ' + posters.length);
});

for(const file of posters){
  test(file + ': the frame can read its chart\'s box, and is big enough to hold it', () => {
    const svg = readFileSync(new URL(file, DIR), 'utf8');
    const outer = svg.match(DIMS);
    assert.ok(outer, 'the poster\'s own root <svg> must expose integer width/height (svgToCanvas sizes the PNG from them)');

    /* the chart is embedded in a translate group after the frame's ground + hero */
    const inner = svg.slice(svg.indexOf('<g transform="translate')).match(DIMS);
    assert.ok(inner, 'the embedded chart\'s width/height must be readable by posterSvg\'s chartDims — ' +
      'if this fails, the frame silently fell back to 900x400 and the footer is sitting on the chart');

    const [, cw, ch] = inner.map(Number);
    const [, pw, ph] = outer.map(Number);
    assert.ok(pw >= cw, 'poster (' + pw + ') is narrower than its chart (' + cw + ')');
    assert.ok(ph > ch, 'poster (' + ph + ') does not clear its chart (' + ch + ') — footer would overlap');
  });
}
