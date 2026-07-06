import {chromium} from 'playwright';
const out = '/private/tmp/claude-501/-Users-matthew-repos-tools/93b7b22f-a0b2-45d1-a7f5-b6db202bdebe/scratchpad/ctl-';
const browser = await chromium.launch();
const tools = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow'];
for(const theme of ['light', 'dark']){
  for(const t of tools){
    const page = await browser.newPage({viewport: {width: 1200, height: 800}, colorScheme: theme});
    await page.goto('http://localhost:8087/' + t + '/');
    await page.waitForTimeout(700);
    await page.screenshot({path: out + t + '-' + theme + '.png'});
    await page.close();
  }
}
await browser.close();
console.log('done');
