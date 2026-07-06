/* Service-worker registration (a file, not inline, so the CSP can stay strict). */
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
