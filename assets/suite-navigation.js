/* Production origins share one Tools Lab destination; previews stay local. */
const host=location.hostname;
const isEnergy=host==='energy.matthewgarner.me';
const legacyLab=host==='thinking-lab-experiments.matthewg12.chatgpt.site';
const energyPreview=!isEnergy&&host!=='tools.matthewgarner.me'&&!legacyLab&&document.documentElement.dataset.mgSection==='energy';
const href=isEnergy||legacyLab?'https://tools.matthewgarner.me/':energyPreview?'/explore/':'/';
for(const link of document.querySelectorAll('[data-suite-link="explore"]'))link.href=href;
