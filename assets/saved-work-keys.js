// Native stores shared by the read-only work library and backup transport.
export const SOURCE_TOOLS = ['bets', 'case', 'cycles', 'gauge', 'map', 'paths', 'proxy', 'risk', 'roadmap', 'timeline', 'tree', 'wardley', 'why'];
export const NAMED_TOOLS = ['bets', 'gauge', 'map', 'paths', 'proxy', 'roadmap', 'tree', 'why'];
export const BASELINE_TOOLS = ['bets', 'map', 'roadmap', 'timeline', 'wardley', 'why'];
export const LAB_TITLES = {
  commitment:'The commitment spiral', teams:'How teams fit the work', exploration:'Exploration versus delivery',
  flexibility:'Where flexibility gets trapped', delay:'Steering through delay', exceptions:'How exceptions accumulate',
  knowledge:'Specialists and shared knowledge', local:'Local wins, collective losses', predictions:'When predictions change behaviour',
  accuracy:'Accurate enough for which decision?', reliability:'Almost reliable parts', adoption:'Crossing the adoption gap',
  reframe:'Reframing workbench', mixer:'Possibility mixer', constraints:'Constraint playground', analogy:'Analogy workshop',
  interventions:'Intervention workbench', answers:'Three different answers', objections:'Alternatives workbench',
  territory:'Unexplored territory', scenes:'Scene-first invention', family:'Idea family tree', questions:'Questions before answers', disagreement:'Productive disagreement',
};
export const REGISTER_KEY = /^premortem:(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|d\d{10,16}|imp\d{10,16}[a-z\d]{4}|example-lantern)$/i;
