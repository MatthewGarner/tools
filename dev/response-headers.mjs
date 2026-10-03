/* Header sources intentionally use only anchored regular-expression groups,
   understood both by Vercel's source matcher and this local emulator. */
import {readFileSync} from 'node:fs';
import {LOCAL_ARTICLE_ORIGINS} from '../embed/v1/bridge.js';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
export function matchingHeaderRows(pathname){
  return config.headers.filter(row => new RegExp('^' + row.source + '$').test(pathname));
}
export function responseHeaders(pathname, {local = false} = {}){
  const headers = Object.fromEntries(matchingHeaderRows(pathname).flatMap(row => row.headers.map(h => [h.key, h.value])));
  if(local && pathname.startsWith('/embed/')) headers['Content-Security-Policy'] += ' ' + LOCAL_ARTICLE_ORIGINS.join(' ');
  return headers;
}
