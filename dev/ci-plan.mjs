import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {repositoryPlan, SUITES} from './test-plan.mjs';
import {SHARDS} from './pw/shards.mjs';

export function matrixFor(plan){
  if(!['full','affected','docs','none'].includes(plan.mode)) throw new Error('Invalid CI plan mode');
  if(plan.suites.some(s => !SUITES.includes(s))) throw new Error('Unknown browser suite in CI plan');
  if(plan.mode === 'full' && (plan.suites.length !== SUITES.length || SUITES.some(s => !plan.suites.includes(s))))
    throw new Error('Full CI plan must cover every suite');
  if(['docs','none'].includes(plan.mode) && (plan.suites.length || plan.tools.length))
    throw new Error('No-browser CI plan cannot contain selected work');
  if(plan.mode === 'affected' && (!plan.suites.length || !plan.tools.length))
    throw new Error('Affected CI plan must contain selected work');
  if(new Set(plan.suites).size !== plan.suites.length) throw new Error('Duplicate CI suite');
  const matrix = SHARDS.map(shard => {
    const suites = shard.suites.filter(s => plan.suites.includes(s));
    const browsers = suites.includes('webkit.mjs') ? 'chromium webkit' : 'chromium';
    return {name:shard.name,suites:suites.join(','),tools:plan.tools.join(','),browsers,cachekey:browsers.replaceAll(' ','-')};
  }).filter(shard => shard.suites);
  // GitHub rejects empty matrices. A successful explicit no-work job still
  // reaches the aggregate verifier, unlike a silently skipped required workflow.
  return matrix.length ? matrix : [{name:'no browser changes',suites:'',tools:'',browsers:'',cachekey:'none'}];
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const plan = process.env.CI_PR_BASE ? repositoryPlan({base:process.env.CI_PR_BASE,head:'HEAD',local:false}) :
    {mode:'full',files:[],tools:[],suites:SUITES,reasons:['Main or manual run: full catalogue regression']};
  const matrix = matrixFor(plan);
  console.log(JSON.stringify(plan,null,2));
  if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'mode='+plan.mode+'\nmatrix='+JSON.stringify(matrix)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    'Test selection: **'+plan.mode+'**\n\n'+plan.reasons.map(r=>'- '+r).join('\n')+'\n\nTools: '+(plan.tools.join(', ')||'all / not applicable')+'\n\nBrowser suites: '+plan.suites.length+'\n');
}
