/* Pure data for Roadmap's non-destructive item receipt. The source line is the
   identity already used by its card menus, drag operations and line rewrites;
   display titles can legitimately be duplicated. */

export function inspectionIdentity(item){
  return item ? {srcLine:item.srcLine} : null;
}

export function inspectedItem(model, identity){
  if(!model || !identity || !Number.isInteger(identity.srcLine)) return null;
  return model.items.find(item => item.srcLine === identity.srcLine) || null;
}

function stateLabel(item){
  if(item.worldState === 'dropped') return 'Not needed in this world';
  if(item.worldState === 'cond' && item.cond)
    return 'Conditional on ' + item.cond.when + ' ' + item.cond.name;
  return 'In the current plan';
}

export function inspectionFacts(model, identity){
  const item = inspectedItem(model, identity);
  if(!item) return null;
  const start = model.horizons[item.h] || 'Unassigned horizon';
  const span = Math.max(1, Number(item.span) || 1);
  const end = model.horizons[Math.min(model.horizons.length - 1, item.h + span - 1)] || start;
  const horizon = span > 1 ? start + ' → ' + end : start;
  return {
    title:item.title,
    note:item.note || '',
    summary:item.title + '. ' + stateLabel(item) + '. ' + horizon + '.',
    facts:[
      ['Plan state', stateLabel(item)],
      ['Horizon', horizon],
      ['Lane', item.lane || 'No lane'],
      ['Status', item.status || 'Not set'],
      ['Condition', item.cond ? item.cond.when + ' ' + item.cond.name : 'None'],
      ['Bet', item.bet ? item.bet.name + (item.bet.outcome ? ' · ' + item.bet.outcome : '') : 'None'],
      ['Source', 'Line ' + item.srcLine],
    ],
  };
}
