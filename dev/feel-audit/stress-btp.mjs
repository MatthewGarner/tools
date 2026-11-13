/* Large documents for the Bets, Tree and Paths feel audit. Generated, so each is
   reproducible and its size is stated: Bets 48 bets in 8 groups; Tree 57 nodes with
   ranged probabilities on every outcome; Paths the realistic interaction-budget case
   (6 decisions, 24 conditional items). */
import {PATHS_INTERACTION_CASES} from '../../paths/tests/fixtures/interaction-budget.mjs';

export function betsLarge(groups = 8, per = 6){
  const out = ['title: Feel audit — large portfolio', 'unit: £k', ''];
  for(let g = 0; g < groups; g++){
    out.push(`Group ${g + 1} bets`);
    for(let b = 0; b < per; b++){
      const lo = 10 + (g * 7 + b * 11) % 50, stake = 20 + (g * 13 + b * 17) % 200;
      out.push(`  Bet ${g + 1}.${b + 1}: stake ${stake}, odds ${lo}-${lo + 15}%, payoff ${stake}-${stake * 3}`);
      if(b % 2 === 0) out.push(`    kill: Metric ${g + 1}.${b + 1} flat by 2026-12-01`);
    }
    out.push('');
  }
  return out.join('\n');
}

export function treeLarge(options = 4){
  const out = ['title: Feel audit — large tree', 'currency: £', '', 'Strategy'];
  for(let o = 0; o < options; o++){
    out.push(`  Option ${o + 1}: -${100 + o * 40}k to -${150 + o * 40}k`);
    out.push('    Market');
    const outs = [['Strong', '0.2-0.35'], ['Steady', '0.3-0.45'], ['Weak', 'rest']];
    for(const [name, p] of outs){
      out.push(`      ${name} ${o + 1} (p=${p})`);
      out.push(`        Follow-on ${name} ${o + 1}`);
      out.push(`          Renewal ${name} ${o + 1} (p=0.4-0.6): ${1 + o}M to ${3 + o}M`);
      out.push(`          Churn ${name} ${o + 1} (p=rest): 100k to ${400 + o * 50}k`);
    }
  }
  return out.join('\n');
}

export const pathsLarge = () => PATHS_INTERACTION_CASES[0].text;
