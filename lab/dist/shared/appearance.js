/* Preserve an existing Lab appearance once, before the common identity starts.
   The new key owns future choices, including resetting to system appearance. */
(() => {
  try {
    if(localStorage.getItem('thinking-lab:appearance-migrated')!==null)return;
    const prior=localStorage.getItem('thinking-lab:appearance');
    if(localStorage.getItem('mg:appearance')===null&&(prior==='light'||prior==='dark'))localStorage.setItem('mg:appearance',prior);
    localStorage.setItem('thinking-lab:appearance-migrated','1');
  } catch {}
})();
