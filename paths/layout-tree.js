/* /paths wide tree geometry. Pure: this module returns numbers and source
   references only; SVG and display copy belong to render-tree.js. */

export const TREE_GEOMETRY = Object.freeze({
  marginX: 36,
  marginY: 30,
  todayW: 88,
  todayH: 30,
  spineW: 164,
  itemW: 184,
  questionW: 220,
  diamondW: 132,
  diamondH: 112,
  unitGap: 18,
  questionLead: 52,
  questionGap: 72,
  minQuestionGap: 24,
  branchGap: 48,
  armGap: 12,
  breadcrumbH: 28,
  stumpH: 40,
  terminalGap: 42,
  terminalW: 252,
  terminalH: 88,
  minCanvasW: 520,
});

const FONT = '600 13px sans-serif';
const NOTE_FONT = '10px sans-serif';
const META_FONT = '600 9px sans-serif';

function safeMeasure(measure, text, font = FONT){
  const value = Number(measure(String(text ?? ''), font));
  return Number.isFinite(value) && value >= 0 ? value : String(text ?? '').length * 7;
}

function lineCount(text, maxW, measure, font){
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return 0;
  let lines = 1, current = '';
  for(const word of words){
    const trial = current ? current + ' ' + word : word;
    if(!current || safeMeasure(measure, trial, font) <= maxW) current = trial;
    else { lines++; current = word; }
  }
  return lines;
}

export function itemCardLayout(item, width, measure){
  const inner = width - 24;
  const titleLines = Math.min(3, Math.max(1, lineCount(item?.title, inner, measure, FONT)));
  const noteLines = item?.note
    ? Math.min(2, Math.max(1, lineCount(item.note, inner, measure, NOTE_FONT))) : 0;
  const secondaryCount = item?.secondaryDependencyMode === 'required'
    ? (item?.secondaryDependencies?.length || 0) : 0;
  const status = String(item?.status || '').toUpperCase();
  const rows = {};
  let y = 8;
  const place = (name, height, extra = {}) => {
    rows[name] = {y, h:height, ...extra};
    y += height + 6;
  };

  if(item?.lane || status){
    const statusW = status
      ? Math.min(inner, Math.max(38, safeMeasure(measure, status, META_FONT) + 12)) : 0;
    place('meta', 14, {
      lane:item?.lane ? {x:0, w:Math.max(0, inner - statusW - (statusW ? 6 : 0))} : null,
      status:status ? {x:inner - statusW, w:statusW} : null,
    });
  }
  place('title', titleLines * 16, {lines:titleLines});
  place('state', 12);
  if(noteLines) place('note', noteLines * 14, {lines:noteLines});
  if(item?.parentDecision) place('primary', 16);
  if(secondaryCount){
    rows.secondary = Array.from({length:secondaryCount}, () => {
      const row = {y, h:16};
      y += 22;
      return row;
    });
  }
  return {h:y - 6 + 8, inner, rows};
}

function itemHeight(item, width, measure){
  return itemCardLayout(item, width, measure).h;
}

function crumbWidth(crumb, measure){
  const label = crumb?.decision?.name || crumb?.decision?.key || crumb?.key || '';
  return Math.max(104, Math.min(176, safeMeasure(measure, label, '600 12px sans-serif') + 42));
}

function streamHeight(entries, gap){
  return entries.reduce((sum, entry) => sum + entry.h, 0) + Math.max(0, entries.length - 1) * gap;
}

function questionStreams(question, measure, G){
  const side = name => (question.arms?.[name] || []).map((item, index) => {
    const card = itemCardLayout(item, G.itemW, measure);
    return {item, index, side:name, w:G.itemW, h:card.h, card};
  });
  const yes = side('yes'), no = side('no');
  const stump = question.stump ? {source:question.stump, side:question.stump.side,
    count:question.stump.count, items:question.stump.items || [], w:G.itemW,
    h:Math.max(G.stumpH, 24 + (question.stump.items?.length || 0) * 16)} : null;
  if(stump) (stump.side === 'yes' ? yes : no).push(stump);
  return {yes, no};
}

function continuationWidth(items, G){
  return (items || []).length * (G.unitGap + G.spineW);
}

function hasBranchOutput(question){
  return !!(question?.stump || question?.arms?.yes?.length || question?.arms?.no?.length);
}

function breadcrumbColumnWidth(crumb, measure, G){
  return Math.max(crumbWidth(crumb, measure), hasBranchOutput(crumb) ? G.itemW : 0);
}

function totalWidth(projection, collapsed, questionGap, measure, G){
  const keys = new Set(collapsed.map(crumb => crumb.key));
  const questions = projection.questions.filter(question => !keys.has(question.key));
  let used = G.marginX + G.todayW;
  for(const _item of projection.spine) used += G.unitGap + G.spineW;
  for(const crumb of collapsed){
    used += G.unitGap + breadcrumbColumnWidth(crumb, measure, G);
    used += continuationWidth(crumb.continuation, G);
  }
  if(questions.length){
    used += G.questionLead + questions.reduce((sum, question) =>
      sum + G.questionW + continuationWidth(question.continuation, G), 0) +
      Math.max(0, questions.length - 1) * questionGap;
  }
  if(projection.terminal) used += G.terminalGap + G.terminalW;
  return used + G.marginX;
}

function unplacedNaturalWidth(items, G){
  const count = items?.length || 0;
  return count ? G.marginX * 2 + count * G.itemW + Math.max(0, count - 1) * G.unitGap : 0;
}

function placeStream(entries, side, centerX, diamond, offset, G){
  const boxes = [];
  if(side === 'yes'){
    let cursor = diamond.y - G.branchGap - offset;
    for(const entry of entries){
      cursor -= entry.h;
      boxes.push({...entry, x:centerX - entry.w / 2, y:cursor});
      cursor -= G.armGap;
    }
  } else {
    let cursor = diamond.y + diamond.h + G.branchGap + offset;
    for(const entry of entries){
      boxes.push({...entry, x:centerX - entry.w / 2, y:cursor});
      cursor += entry.h + G.armGap;
    }
  }
  return boxes;
}

function placeBalancedStreams(stream, centerX, node, G){
  const yesHeight = streamHeight(stream.yes, G.armGap);
  const noHeight = streamHeight(stream.no, G.armGap);
  const horizon = Math.max(yesHeight, noHeight);
  return {
    yes:placeStream(stream.yes, 'yes', centerX, node,
      stream.yes.length ? horizon - yesHeight : 0, G),
    no:placeStream(stream.no, 'no', centerX, node,
      stream.no.length ? horizon - noHeight : 0, G),
  };
}

function armGeometry(question, node, centerX, yes, no){
  const connector = (side, boxes) => boxes.length ? {
    side,
    x:centerX,
    y1:side === 'yes' ? Math.min(...boxes.map(box => box.y)) : node.y + node.h,
    y2:side === 'yes' ? node.y : Math.max(...boxes.map(box => box.y + box.h)),
    nearY:side === 'yes' ? Math.max(...boxes.map(box => box.y + box.h)) : Math.min(...boxes.map(box => box.y)),
  } : null;
  const label = side => ({side, text:side === 'yes' ? 'If so' : 'If not',
    x:centerX + 8,
    y:side === 'yes' ? node.y - 9 : node.y + node.h + 15,
    anchor:'start'});
  const labels = question?.chosenSide ? [
    {side:question.chosenSide, text:question.chosenSide === 'yes' ? 'If so' : 'If not',
      x:node.x + node.w + 8, y:node.cy - 7, anchor:'start'},
    label(question.chosenSide === 'yes' ? 'no' : 'yes'),
  ] : [label('yes'), label('no')];
  return {connectors:{yes:connector('yes', yes), no:connector('no', no)}, armLabels:labels};
}

function placeUnplaced(items, y, canvasWidth, measure, G){
  const boxes = [];
  let x = G.marginX, rowY = y, rowH = 0;
  for(const item of items){
    const card = itemCardLayout(item, G.itemW, measure);
    const h = card.h;
    if(x > G.marginX && x + G.itemW > canvasWidth - G.marginX){
      x = G.marginX;
      rowY += rowH + G.armGap;
      rowH = 0;
    }
    boxes.push({item, x, y:rowY, w:G.itemW, h, card});
    x += G.itemW + G.unitGap;
    rowH = Math.max(rowH, h);
  }
  return {boxes, bottom:boxes.length ? rowY + rowH : y};
}

/* Returned shape:
   {width, contentWidth, height, overflow, compressed, questionGap,
    minQuestionGap, axisY, today, spineRun, spine[], breadcrumbs[], continuations[], terminal,
    collapsedKeys[], questions[{question,diamond,arms:{yes[],no[]},continuation[],stump}],
    unplaced[]}.

   `width` is the requested viewport. `contentWidth` is the wide artefact width;
   callers can pan it when `overflow` is true. */
export function treeLayout(projection, {width = 1200, measure = text => String(text).length * 7} = {}){
  const G = TREE_GEOMETRY;
  const numericWidth = Number(width);
  const requestedWidth = Math.max(1, Number.isFinite(numericWidth) ? numericWidth : 1200);
  const collapsed = [];
  for(const crumb of projection.breadcrumbs){
    const normal = totalWidth(projection, collapsed, G.questionGap, measure, G);
    if(normal <= requestedWidth) break;
    const visibleCount = projection.questions.length - collapsed.length;
    const compressed = totalWidth(projection, collapsed,
      visibleCount > 1 ? G.minQuestionGap : G.questionGap, measure, G);
    if(compressed <= requestedWidth) break;
    collapsed.push(crumb);
  }

  const collapsedKeys = collapsed.map(crumb => crumb.key);
  const collapsedSet = new Set(collapsedKeys);
  const visible = projection.questions.filter(question => !collapsedSet.has(question.key));
  let questionGap = G.questionGap;
  const idealWidth = totalWidth(projection, collapsed, questionGap, measure, G);
  if(idealWidth > requestedWidth && visible.length > 1){
    const atZero = totalWidth(projection, collapsed, 0, measure, G);
    questionGap = Math.max(G.minQuestionGap,
      Math.min(G.questionGap, (requestedWidth - atZero) / (visible.length - 1)));
  }
  const contentWidth = totalWidth(projection, collapsed, questionGap, measure, G);
  const overflow = contentWidth > requestedWidth + 0.01;
  /* A 1160px export should not become a mostly-empty poster when the whole
     plan is TODAY plus one card. Keep the wide artefact at least 520px, grow
     it to its real tree width, and preserve a natural one-row width for loose
     cards up to the requested viewport. Dense trees still overflow and pan. */
  const canvasFloor = Math.min(requestedWidth, G.minCanvasW);
  const looseWidth = Math.min(requestedWidth, unplacedNaturalWidth(projection.unplaced, G));
  const canvasWidth = Math.max(contentWidth, canvasFloor, looseWidth);

  const streams = new Map(visible.map(question => [question.key, questionStreams(question, measure, G)]));
  const collapsedStreams = new Map(collapsed.map(crumb => [crumb.key, questionStreams(crumb, measure, G)]));
  let armRadius = 0;
  for(const question of visible){
    const stream = streams.get(question.key);
    armRadius = Math.max(armRadius, streamHeight(stream.yes, G.armGap), streamHeight(stream.no, G.armGap));
  }
  for(const crumb of collapsed){
    const stream = collapsedStreams.get(crumb.key);
    armRadius = Math.max(armRadius, streamHeight(stream.yes, G.armGap), streamHeight(stream.no, G.armGap));
  }
  const spineHalf = Math.max(G.todayH / 2,
    ...projection.spine.map(item => itemHeight(item, G.spineW, measure) / 2),
    ...projection.questions.flatMap(question => question.continuation || [])
      .map(item => itemHeight(item, G.spineW, measure) / 2),
    collapsed.length ? G.breadcrumbH / 2 : 0,
    projection.terminal ? G.terminalH / 2 : 0);
  const branchNodeHalf = Math.max(visible.length ? G.diamondH / 2 : 0,
    collapsed.some(hasBranchOutput) ? G.breadcrumbH / 2 : 0);
  const axisY = G.marginY + Math.max(spineHalf,
    branchNodeHalf + (armRadius ? G.branchGap + armRadius : 0));

  let x = G.marginX;
  const today = {x, y:axisY - G.todayH / 2, w:G.todayW, h:G.todayH};
  x += G.todayW;
  const spine = projection.spine.map((item, index) => {
    x += G.unitGap;
    const card = itemCardLayout(item, G.spineW, measure);
    const h = card.h;
    const box = {item, index, x, y:axisY - h / 2, w:G.spineW, h, card};
    x += G.spineW;
    return box;
  });
  const continuations = [];
  const breadcrumbs = collapsed.map((crumb, index) => {
    x += G.unitGap;
    const columnW = breadcrumbColumnWidth(crumb, measure, G);
    const w = crumbWidth(crumb, measure);
    const centerX = x + columnW / 2;
    const node = {x:centerX - w / 2, y:axisY - G.breadcrumbH / 2,
      w, h:G.breadcrumbH, cx:centerX, cy:axisY};
    const stream = collapsedStreams.get(crumb.key);
    const placed = placeBalancedStreams(stream, centerX, node, G);
    const {yes, no} = placed;
    const stump = [...yes, ...no].find(candidate => candidate.source) || null;
    const geometry = armGeometry(crumb, node, centerX, yes, no);
    const box = {crumb, index, ...node, centerX,
      arms:{yes:yes.filter(candidate => candidate.item), no:no.filter(candidate => candidate.item)},
      stump, ...geometry};
    x += columnW;
    for(const [itemIndex, item] of (crumb.continuation || []).entries()){
      x += G.unitGap;
      const card = itemCardLayout(item, G.spineW, measure);
      const h = card.h;
      continuations.push({item, index:itemIndex, questionKey:crumb.key,
        x, y:axisY - h / 2, w:G.spineW, h, card});
      x += G.spineW;
    }
    return box;
  });

  const questions = [];
  if(visible.length) x += G.questionLead;
  for(let index = 0; index < visible.length; index++){
    const question = visible[index];
    if(index) x += questionGap;
    const questionX = x;
    const centerX = questionX + G.questionW / 2;
    const diamond = {x:centerX - G.diamondW / 2, y:axisY - G.diamondH / 2,
      w:G.diamondW, h:G.diamondH, cx:centerX, cy:axisY};
    const stream = streams.get(question.key);
    const placed = placeBalancedStreams(stream, centerX, diamond, G);
    const {yes, no} = placed;
    const stump = [...yes, ...no].find(box => box.source) || null;
    const geometry = armGeometry(question, diamond, centerX, yes, no);
    x += G.questionW;
    const continuation = (question.continuation || []).map((item, itemIndex) => {
      x += G.unitGap;
      const card = itemCardLayout(item, G.spineW, measure);
      const h = card.h;
      const box = {item, index:itemIndex, questionKey:question.key,
        x, y:axisY - h / 2, w:G.spineW, h, card};
      x += G.spineW;
      return box;
    });
    questions.push({question, index, x:questionX, y:diamond.y,
      w:G.questionW + continuationWidth(question.continuation, G), h:G.diamondH,
      centerX, diamond, arms:{yes:yes.filter(box => box.item), no:no.filter(box => box.item)},
      continuation, stump, ...geometry});
  }

  let terminal = null;
  if(projection.terminal){
    x += G.terminalGap;
    terminal = {source:projection.terminal, x, y:axisY - G.terminalH / 2,
      w:G.terminalW, h:G.terminalH, cx:x, cy:axisY};
    x += G.terminalW;
  }

  const lastQuestion = questions.at(-1);
  const lastContinuation = lastQuestion?.continuation?.at(-1);
  const lastCollapsedContinuation = continuations.at(-1);
  const lastSpine = spine.at(-1);
  const lastBreadcrumb = breadcrumbs.at(-1);
  const lastCenter = lastQuestion
    ? (lastContinuation ? lastContinuation.x + lastContinuation.w : lastQuestion.centerX)
    : lastCollapsedContinuation ? lastCollapsedContinuation.x + lastCollapsedContinuation.w :
    lastSpine ? lastSpine.x + lastSpine.w / 2 :
    lastBreadcrumb ? lastBreadcrumb.x + lastBreadcrumb.w / 2 : today.x + today.w;
  const spineRun = {x1:today.x + today.w, x2:terminal?.x ?? lastCenter, y:axisY, items:spine};
  const treeBottom = axisY + Math.max(spineHalf,
    branchNodeHalf + (armRadius ? G.branchGap + armRadius : 0));
  const unplacedTop = treeBottom + (projection.unplaced.length ? 42 : 0);
  const loose = placeUnplaced(projection.unplaced, unplacedTop, canvasWidth, measure, G);
  const height = Math.ceil((projection.unplaced.length ? loose.bottom : treeBottom) + G.marginY);

  return {width:requestedWidth, contentWidth:canvasWidth, height, totalHeight:height,
    overflow, compressed:questionGap < G.questionGap, questionGap,
    minQuestionGap:G.minQuestionGap, axisY, today, spineRun, spine, breadcrumbs, continuations, terminal,
    collapsedKeys, questions, unplaced:loose.boxes, unplacedY:unplacedTop};
}
