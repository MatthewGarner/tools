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
});

const FONT = '600 14px sans-serif';
const NOTE_FONT = '12px sans-serif';

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

function itemHeight(item, width, measure){
  const inner = width - 24;
  const titleLines = Math.min(3, Math.max(1, lineCount(item?.title, inner, measure, FONT)));
  const noteLines = item?.note
    ? Math.min(2, Math.max(1, lineCount(item.note, inner, measure, NOTE_FONT))) : 0;
  const needs = item?.secondaryDependencies?.length ? 24 : 0;
  const status = item?.status ? 20 : 0;
  return 18 + titleLines * 18 + 20 + noteLines * 16 + needs + status;
}

function crumbWidth(crumb, measure){
  const label = crumb?.decision?.question || crumb?.decision?.name || crumb?.key || '';
  return Math.max(104, Math.min(176, safeMeasure(measure, label, '600 12px sans-serif') + 42));
}

function streamHeight(entries, gap){
  return entries.reduce((sum, entry) => sum + entry.h, 0) + Math.max(0, entries.length - 1) * gap;
}

function questionStreams(question, measure, G){
  const side = name => question.arms[name].map((item, index) => ({
    item, index, side:name, w:G.itemW, h:itemHeight(item, G.itemW, measure),
  }));
  const yes = side('yes'), no = side('no');
  const stump = question.stump ? {source:question.stump, side:question.stump.side,
    count:question.stump.count, w:G.itemW, h:G.stumpH} : null;
  if(stump) (stump.side === 'yes' ? yes : no).push(stump);
  return {yes, no};
}

function totalWidth(projection, collapsed, questionGap, measure, G){
  const keys = new Set(collapsed.map(crumb => crumb.key));
  const questions = projection.questions.filter(question => !keys.has(question.key));
  let used = G.marginX + G.todayW;
  for(const _item of projection.spine) used += G.unitGap + G.spineW;
  for(const crumb of collapsed) used += G.unitGap + crumbWidth(crumb, measure);
  if(questions.length){
    used += G.questionLead + questions.length * G.questionW +
      Math.max(0, questions.length - 1) * questionGap;
  }
  return used + G.marginX;
}

function placeStream(entries, side, centerX, diamond, G){
  const boxes = [];
  if(side === 'yes'){
    let cursor = diamond.y - G.branchGap;
    for(const entry of entries){
      cursor -= entry.h;
      boxes.push({...entry, x:centerX - entry.w / 2, y:cursor});
      cursor -= G.armGap;
    }
  } else {
    let cursor = diamond.y + diamond.h + G.branchGap;
    for(const entry of entries){
      boxes.push({...entry, x:centerX - entry.w / 2, y:cursor});
      cursor += entry.h + G.armGap;
    }
  }
  return boxes;
}

function placeUnplaced(items, y, canvasWidth, measure, G){
  const boxes = [];
  let x = G.marginX, rowY = y, rowH = 0;
  for(const item of items){
    const h = itemHeight(item, G.itemW, measure);
    if(x > G.marginX && x + G.itemW > canvasWidth - G.marginX){
      x = G.marginX;
      rowY += rowH + G.armGap;
      rowH = 0;
    }
    boxes.push({item, x, y:rowY, w:G.itemW, h});
    x += G.itemW + G.unitGap;
    rowH = Math.max(rowH, h);
  }
  return {boxes, bottom:boxes.length ? rowY + rowH : y};
}

/* Returned shape:
   {width, contentWidth, height, overflow, compressed, questionGap,
    minQuestionGap, axisY, today, spineRun, spine[], breadcrumbs[],
    collapsedKeys[], questions[{question,diamond,arms:{yes[],no[]},stump}],
    unplaced[]}.

   `width` is the requested viewport. `contentWidth` is the wide artefact width;
   callers can pan it when `overflow` is true. */
export function treeLayout(projection, {width = 1200, measure = text => String(text).length * 7} = {}){
  const G = TREE_GEOMETRY;
  const requestedWidth = Math.max(1, Number(width) || 1200);
  const collapsed = [];
  for(const crumb of projection.breadcrumbs){
    if(totalWidth(projection, collapsed, G.questionGap, measure, G) <= requestedWidth) break;
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
  const canvasWidth = Math.max(requestedWidth, contentWidth);

  const streams = new Map(visible.map(question => [question.key, questionStreams(question, measure, G)]));
  let armRadius = 0;
  for(const question of visible){
    const stream = streams.get(question.key);
    armRadius = Math.max(armRadius, streamHeight(stream.yes, G.armGap), streamHeight(stream.no, G.armGap));
  }
  const spineHalf = Math.max(G.todayH / 2,
    ...projection.spine.map(item => itemHeight(item, G.spineW, measure) / 2),
    collapsed.length ? G.breadcrumbH / 2 : 0);
  const diamondHalf = visible.length ? G.diamondH / 2 : 0;
  const axisY = G.marginY + Math.max(spineHalf, diamondHalf + (armRadius ? G.branchGap + armRadius : 0));

  let x = G.marginX;
  const today = {x, y:axisY - G.todayH / 2, w:G.todayW, h:G.todayH};
  x += G.todayW;
  const spine = projection.spine.map((item, index) => {
    x += G.unitGap;
    const h = itemHeight(item, G.spineW, measure);
    const box = {item, index, x, y:axisY - h / 2, w:G.spineW, h};
    x += G.spineW;
    return box;
  });
  const breadcrumbs = collapsed.map((crumb, index) => {
    x += G.unitGap;
    const w = crumbWidth(crumb, measure);
    const box = {crumb, index, x, y:axisY - G.breadcrumbH / 2, w, h:G.breadcrumbH};
    x += w;
    return box;
  });

  const questions = [];
  if(visible.length) x += G.questionLead;
  for(let index = 0; index < visible.length; index++){
    const question = visible[index];
    if(index) x += questionGap;
    const centerX = x + G.questionW / 2;
    const diamond = {x:centerX - G.diamondW / 2, y:axisY - G.diamondH / 2,
      w:G.diamondW, h:G.diamondH, cx:centerX, cy:axisY};
    const stream = streams.get(question.key);
    const yes = placeStream(stream.yes, 'yes', centerX, diamond, G);
    const no = placeStream(stream.no, 'no', centerX, diamond, G);
    const stump = [...yes, ...no].find(box => box.source) || null;
    questions.push({question, index, x, y:diamond.y, w:G.questionW, h:G.diamondH,
      centerX, diamond, arms:{yes:yes.filter(box => box.item), no:no.filter(box => box.item)}, stump});
    x += G.questionW;
  }

  const lastCenter = questions.at(-1)?.centerX ?? spine.at(-1)?.x + spine.at(-1)?.w / 2 ??
    breadcrumbs.at(-1)?.x + breadcrumbs.at(-1)?.w / 2 ?? today.x + today.w;
  const spineRun = {x1:today.x + today.w, x2:lastCenter, y:axisY, items:spine};
  const treeBottom = axisY + Math.max(spineHalf,
    diamondHalf + (armRadius ? G.branchGap + armRadius : 0));
  const unplacedTop = treeBottom + (projection.unplaced.length ? 42 : 0);
  const loose = placeUnplaced(projection.unplaced, unplacedTop, canvasWidth, measure, G);
  const height = Math.ceil((projection.unplaced.length ? loose.bottom : treeBottom) + G.marginY);

  return {width:requestedWidth, contentWidth:canvasWidth, height, totalHeight:height,
    overflow, compressed:questionGap < G.questionGap, questionGap,
    minQuestionGap:G.minQuestionGap, axisY, today, spineRun, spine, breadcrumbs,
    collapsedKeys, questions, unplaced:loose.boxes, unplacedY:unplacedTop};
}
