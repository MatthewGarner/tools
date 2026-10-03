/* Exact-origin messaging; article preferences are transient, never persisted. */
export const ARTICLE_ORIGINS = ['https://www.matthewgarner.me', 'https://matthewgarner.me'];
export const LOCAL_ARTICLE_ORIGINS = ['http://127.0.0.1:4321', 'http://localhost:4321',
  'http://127.0.0.1:4335', 'http://localhost:4335'];

export function parentOrigin({origin, search = '', referrer = ''}){
  const here = new URL(origin);
  const local = here.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(here.hostname);
  const allowed = local ? [...ARTICLE_ORIGINS, ...LOCAL_ARTICLE_ORIGINS] : ARTICLE_ORIGINS;
  const requested = new URLSearchParams(search).get('parent');
  try {
    const candidate = new URL(requested === null ? referrer : requested);
    // An explicit query value must be an origin, never a URL with credentials/path.
    if(requested !== null && requested !== candidate.origin) return null;
    return allowed.includes(candidate.origin) ? candidate.origin : null;
  } catch { return null; }
}

export function validThemeMessage(event, parent, origin){
  return !!origin && event.source === parent && event.origin === origin &&
    event.data?.type === 'mg-tool:theme' && event.data.version === 1 &&
    ['light', 'dark'].includes(event.data.theme);
}

export function mountBridge(element){
  const origin = parentOrigin({origin:location.origin, search:location.search, referrer:document.referrer});
  if(parent === window || !origin) return;
  const send = message => parent.postMessage({...message, version:1}, origin);
  addEventListener('message', event => {
    if(validThemeMessage(event, parent, origin)) document.documentElement.dataset.theme = event.data.theme;
  });
  let previousHeight = 0;
  const resize = () => {
    const height = Math.ceil(element.getBoundingClientRect().height);
    if(height === previousHeight) return;
    previousHeight = height;
    send({type:'mg-tool:resize', height});
  };
  new ResizeObserver(resize).observe(element);
  send({type:'mg-tool:ready'});
  resize();
}
