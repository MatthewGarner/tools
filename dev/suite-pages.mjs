import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {experiments} from '../lab/dist/shared/catalog.js';
export const LAB_ROUTES = experiments.map(item => item.route);
export const SUITE_PAGES = [
  {page:'404.html',section:'explore',catalogue:true,file:true},
  {page:'explore',section:'explore',catalogue:true},
  {page:'home',section:'tools',catalogue:true},
  ...TOOL_DIRS.map(page=>({page,section:'tools'})),
  {page:'energy',section:'energy',catalogue:true},
  ...ENERGY_TOOL_DIRS.map(page=>({page:'energy/'+page,section:'energy'})),
  {page:'lab/dist',section:'lab',catalogue:true},
  ...LAB_ROUTES.map(page=>({page:'lab/dist/'+page,section:'lab'})),
  {page:'lab/dist/about.html',section:'lab',catalogue:true,file:true},
  {page:'backup',section:'backup',catalogue:true},
];
