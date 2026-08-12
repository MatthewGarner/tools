/* Atomic provenance grammar shared by Roadmap (the owner/writer) and Case
   (the local exhibit reader). A failure rejects the complete receipt: no
   consumer may recover a partial world and present it as the basis. */

function realIsoDate(value){
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if(year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function parseProjectionBasis(value, srcLine){
  /* Deck exports have a fixed header band. Keep the provenance ledger fully
     visible rather than accepting a syntactically-valid wall of text which
     would push the roadmap beneath the footer. */
  const MAX_SOURCE = 80, MAX_KEY = 32, MAX_ENTRIES = 8;
  if(typeof value !== 'string') return {error:'start with paths "Source"'};
  const clauses = value.split(';');
  if(clauses.some(clause => !clause.trim())) return {error:'empty clause or extra semicolon'};
  const head = clauses.shift().trim().match(/^paths\s+"([^"]+)"$/i);
  if(!head) return {error:'start with paths "Source"'};
  const source = head[1];
  if(!source.trim() || /[";\t\r\n]|\/\//.test(source))
    return {error:'source label contains a forbidden delimiter'};
  if(source.length > MAX_SOURCE) return {error:'source label is too long for the projection header (max ' + MAX_SOURCE + ' characters)'};

  const valueOut = {source, answered:[], assumed:[], srcLine};
  const seenClauses = new Set(), seenKeys = new Set();
  for(const rawClause of clauses){
    const clause = rawClause.trim().match(/^(answered|assumed)\s+(.+)$/i);
    if(!clause) return {error:'use only answered or assumed clauses with entries'};
    const ledger = clause[1].toLowerCase();
    if(seenClauses.has(ledger)) return {error:'duplicate ' + ledger + ' clause'};
    seenClauses.add(ledger);
    const entries = clause[2].split(',');
    if(entries.some(entry => !entry.trim())) return {error:'empty ledger entry or extra comma'};
    for(const rawEntry of entries){
      const entry = rawEntry.trim().match(/^([A-Za-z0-9-]+)\s*=\s*(yes|no)\s*@\s*(\d{4}-\d{2}-\d{2})$/i);
      if(!entry) return {error:'entries want key=yes|no@YYYY-MM-DD'};
      if(entry[1].length > MAX_KEY) return {error:'decision key is too long for the projection header (max ' + MAX_KEY + ' characters)'};
      if(valueOut.answered.length + valueOut.assumed.length >= MAX_ENTRIES)
        return {error:'projection header supports at most ' + MAX_ENTRIES + ' decision entries'};
      const keyLc = entry[1].toLowerCase();
      if(seenKeys.has(keyLc)) return {error:'duplicate decision key "' + entry[1] + '"'};
      if(!realIsoDate(entry[3])) return {error:'entry date is not a real ISO calendar date'};
      seenKeys.add(keyLc);
      valueOut[ledger].push({key:entry[1], direction:entry[2].toLowerCase(), date:entry[3]});
    }
  }
  if(!valueOut.answered.length && !valueOut.assumed.length)
    return {error:'include at least one answered or assumed entry'};
  return {value:valueOut};
}
