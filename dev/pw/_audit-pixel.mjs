import {chromium, devices} from 'playwright';
const out = '/private/tmp/claude-501/-Users-matthew-repos-tools/93b7b22f-a0b2-45d1-a7f5-b6db202bdebe/scratchpad/px-';
const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['Pixel 7'], colorScheme: 'dark'});
const shots = [
  ['landing', '/', null], ['gauge', '/gauge/', 'Q3 commitment review'],
  ['roadmap', '/roadmap/', 'Habit app roadmap'], ['fermi', '/fermi/', 'Weekly meeting, annual cost'],
  ['timeline', '/timeline/', 'App launch programme'], ['flow', '/flow/', null],
];
for(const [name, path, chip] of shots){
  const page = await ctx.newPage();
  await page.goto('http://localhost:8087' + path);
  await page.waitForTimeout(600);
  if(chip){ try{ await page.getByRole('button', {name: chip}).tap({timeout: 3000}); }catch(e){} await page.waitForTimeout(700); }
  await page.screenshot({path: out + name + '.png', fullPage: true});
  await page.close();
}
await browser.close();
console.log('done');
