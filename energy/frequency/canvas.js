/* Canvas painter for the frequency scene. No DOM or simulation work lives
   here; a recording 2D context can exercise every drawing decision in tests. */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const DEFAULT_COLORS = {accent:'#C05621', err:'#b00', ink:'#111', muted:'#666'};

export function canvasTraceFrame(width, height){
  return {x0: 48, x1: width - 16, y0: 14, y1: height - 24};
}

export function projectCanvasTrace(scene, width, height){
  const {x0, x1, y0, y1} = canvasTraceFrame(width, height);
  return {
    x: time => x0 + ((time - scene.time.start) / (scene.time.end - scene.time.start)) * (x1 - x0),
    y: frequency => y0 + (1 - (frequency - scene.frequency.min) /
      (scene.frequency.max - scene.frequency.min)) * (y1 - y0),
  };
}

export function paintTraceScene(scene, context, width, height, cursor = Infinity, colors = DEFAULT_COLORS){
  const g = context, C = colors || DEFAULT_COLORS;
  if(width <= 64 || height <= 38){
    g.clearRect(0, 0, Math.max(0, width), Math.max(0, height));
    return false;
  }
  const {x0, x1, y1} = canvasTraceFrame(width, height);
  const {x: sx, y: sy} = projectCanvasTrace(scene, width, height);
  g.clearRect(0, 0, width, height);

  g.globalAlpha = 0.06; g.fillStyle = C.accent;
  g.fillRect(x0, sy(scene.frequency.nominalBand.high), x1 - x0,
    sy(scene.frequency.nominalBand.low) - sy(scene.frequency.nominalBand.high));
  g.globalAlpha = 0.09; g.fillStyle = C.err;
  g.fillRect(x0, sy(scene.frequency.threshold.frequency), x1 - x0, y1 - sy(scene.frequency.threshold.frequency));
  g.globalAlpha = 1;

  g.font = '11px ' + FONT; g.textAlign = 'right'; g.textBaseline = 'middle'; g.lineWidth = 1;
  for(const tick of scene.frequency.gridTicks){
    g.strokeStyle = C.muted; g.globalAlpha = tick.frequency === scene.frequency.nominalBand.frequency ? 1 : 0.3;
    g.beginPath(); g.moveTo(x0, sy(tick.frequency)); g.lineTo(x1, sy(tick.frequency)); g.stroke();
    g.globalAlpha = 1; g.fillStyle = C.muted; g.fillText(String(tick.frequency), x0 - 6, sy(tick.frequency));
  }
  const nominal = scene.frequency.nominalBand;
  g.textBaseline = 'alphabetic'; g.fillStyle = C.muted; g.fillText(nominal.label, x1, sy(nominal.frequency) - 6);

  g.strokeStyle = C.err; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(x0, sy(scene.frequency.threshold.frequency)); g.lineTo(x1, sy(scene.frequency.threshold.frequency)); g.stroke();
  g.setLineDash([]); g.fillStyle = C.err; g.fillText(scene.frequency.threshold.label, x1, sy(scene.frequency.threshold.frequency) - 6);

  if(scene.ghost){
    g.globalAlpha = 0.55; g.strokeStyle = C.muted; g.lineWidth = 2; g.setLineDash([6, 4]);
    path(g, scene.ghost.points, sx, sy); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1; g.fillStyle = C.muted; g.textAlign = 'center';
    g.fillText(scene.ghost.label, sx(scene.ghost.nadir.time), sy(scene.ghost.nadir.frequency) - 8);
  }

  g.strokeStyle = C.accent; g.lineWidth = 2.5; g.beginPath();
  let drew = false;
  for(const point of scene.trace.points){
    if(point.time > cursor) break;
    const x = sx(point.time), y = sy(point.frequency);
    if(!drew){g.moveTo(x, y); drew = true;} else g.lineTo(x, y);
  }
  g.stroke();

  if(cursor >= scene.nadir.time){
    g.fillStyle = C.ink; g.beginPath(); g.arc(sx(scene.nadir.time), sy(scene.nadir.frequency), 4, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center'; g.fillText(scene.nadir.label, sx(scene.nadir.time), sy(scene.nadir.frequency) + 18);
  }
  if(scene.rocof){
    g.strokeStyle = C.ink; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(sx(scene.rocof.from.time), sy(scene.rocof.from.frequency));
    g.lineTo(sx(scene.rocof.to.time), sy(scene.rocof.to.frequency)); g.stroke();
    g.setLineDash([]); g.fillStyle = C.ink; g.textAlign = 'left';
    g.fillText(scene.rocof.label, sx(scene.rocof.to.time) + 8, sy(scene.rocof.to.frequency) + 4);
  }
  g.fillStyle = C.muted; g.textAlign = 'left'; g.fillText(scene.axes.start.label, x0, height - 6);
  g.textAlign = 'right'; g.fillText(scene.axes.end.label, x1, height - 6);
  return true;
}

function path(g, points, sx, sy){
  for(let i = 0; i < points.length; i++){
    const x = sx(points[i].time), y = sy(points[i].frequency);
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
}

export const paintFrequencyScene = paintTraceScene;
