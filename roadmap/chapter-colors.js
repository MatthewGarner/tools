/* Shared Chapter palette contract for Roadmap and Timeline. */
import {PALETTES, mix} from '../assets/series.js';
function luminance(hex){
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
export const chapterContrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function readable(col,bg){
  if(chapterContrast(col,bg)>=4.5)return col;
  const to=chapterContrast('#111111',bg)>chapterContrast('#ffffff',bg)?'#111111':'#ffffff';
  for(let t=.05;t<=1;t+=.05){const adjusted=mix(col,to,t);if(chapterContrast(adjusted,bg)>=4.5)return adjusted;}
  return to;
}
export function chapterColors(model,ctx={}){
  const dark=!!ctx.dark;
  const accent=/^#[0-9a-f]{6}$/i.test(model.accent||'') ? model.accent : (PALETTES[model.palette] || PALETTES.ocean)[dark?'dark':'light'];
  const bg=dark?'#171A18':'#F6F3ED',ink=dark?'#F6F3ED':'#171914';
  const rail=accent,railInk=chapterContrast('#ffffff',rail)>=4.5?'#ffffff':'#111111';
  const status=dark?{doing:'#93A8FF',risk:'#D2AE5B',blocked:'#EE9B94',done:'#80BD94'}:{doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A',done:'#1C753C'};
  return {bg,ink,muted:readable(dark?'#B8BDB8':'#686B65',bg),accent:readable(accent,bg),rail,spine:rail,railInk,
    border:mix(bg,ink,.2),tint:mix(bg,accent,dark?.14:.055),band:mix(bg,accent,dark?.18:.075),
    status:Object.fromEntries(Object.entries(status).map(([k,v])=>[k,readable(v,bg)])),
    railStatus:Object.fromEntries(Object.entries(status).map(([k,v])=>[k,readable(v,rail)]))};
}
