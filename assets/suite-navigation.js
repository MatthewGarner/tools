/* Absolute domain links are used only on the established production origins.
   Local servers and previews keep every journey inside the preview. */
const host=location.hostname;
const energy=host==='energy.matthewgarner.me';
const tools=host==='tools.matthewgarner.me';
const legacyLab=host==='thinking-lab-experiments.matthewg12.chatgpt.site';
const urls=energy ? {explore:'https://tools.matthewgarner.me/',tools:'https://tools.matthewgarner.me/product/',energy:'/',lab:'https://tools.matthewgarner.me/lab/'}
  : tools ? {energy:'https://energy.matthewgarner.me/'}
  : legacyLab ? {explore:'https://tools.matthewgarner.me/',tools:'https://tools.matthewgarner.me/product/',energy:'https://energy.matthewgarner.me/',lab:'/'} : {};
// The energy development server identifies itself on its document, too.
if(!energy&&!tools&&!legacyLab&&document.documentElement.dataset.mgSection==='energy'){
  urls.energy=location.pathname.startsWith('/energy/')?'/energy/':'/';
  urls.explore='/explore/';
  urls.tools='/product/';
  urls.lab='/lab/';
}
for(const link of document.querySelectorAll('[data-suite-link]')){
  const href=urls[link.dataset.suiteLink];if(href)link.href=href;
}
