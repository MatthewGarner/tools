import {DAY_DEFAULTS,runDay} from '../../energy/intraday/day.js';
import {RANGES} from '../../energy/intraday/state.js';
import {renderDay,buildDayVerdict} from '../../energy/intraday/render-day.js';
import {MERIT_PALETTE} from '../../energy/merit-order/render.js';
import {base,object,num,choice,range,context} from './classic-shared.js';
export const definition=base('energy-intraday','Intraday storage','Explore how storage changes the prices it trades against.',
 {v:1,c:null,p:{...DAY_DEFAULTS,fleetGW:4}},object({v:choice([1]),c:{type:'null'},p:object(Object.fromEntries(Object.entries(RANGES).map(([k,[lo,hi]])=>[k,num(lo,hi)])))}),
 {fleet:range('Storage fleet, GW',['p','fleetGW'],0,12,.5),duration:range('Storage duration, hours',['p','fleetH'],1,6),wind:range('Wind availability (fraction)',['p','wind'],0,1,.01),gas:range('Gas price, p/therm',['p','gas'],40,300,5)},
 {day:{title:'Day and storage',description:'Twenty-four hourly clearings and the storage fleet’s surviving schedule.',controls:['fleet','duration','wind','gas'],render(s,ctx){const r=runDay(s.p),c=context(ctx);return {svg:renderDay(r,s.p,{...c,palette:MERIT_PALETTE[c.dark?'dark':'light']},{forExport:true}),summary:buildDayVerdict(r,s.p)+' Illustrative fixed day shape and perfect-foresight scheduling; excludes degradation and forecast error.'};}}},
 s=>{if(s.p.peak<s.p.trough)throw new Error('Peak demand must not be below trough demand.');if(s.p.sunrise>=s.p.sunset)throw new Error('Sunset must follow sunrise.');});

definition.views['day'].defaultControls=['fleet', 'duration'];
