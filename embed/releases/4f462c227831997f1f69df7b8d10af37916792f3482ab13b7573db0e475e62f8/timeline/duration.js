/* One duration formatter for every Timeline surface. A whole number of weeks
   prints as weeks; otherwise under 28 days prints days; otherwise the nearest whole
   week. Zero is "0 days", and no non-zero duration ever prints as zero. Sign is the
   caller's: pass the size. */
export function duration(days){
  const a = Math.abs(Math.round(days));
  if(a === 0) return '0 days';
  if(a % 7 === 0) return (a / 7) + (a === 7 ? ' week' : ' weeks');
  if(a < 28) return a + (a === 1 ? ' day' : ' days');
  const w = Math.round(a / 7);
  return w + (w === 1 ? ' week' : ' weeks');
}
