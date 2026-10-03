// Catalogue links select a saved workspace inside the tool's validated state.
// Consume the pointer so a later New/switch and reload cannot resurrect it.
export function resumeWorkspace(state, collection = 'workspaces', search = location.search) {
  const id = new URLSearchParams(search).get('work');
  if (!id) return {state, missing:false};
  const found = state[collection]?.some(work => work.id === id);
  return {state:found ? {...state, activeId:id} : state, missing:!found};
}
export function consumeWorkPointer() {
  const url = new URL(location.href);
  if (!url.searchParams.has('work')) return;
  url.searchParams.delete('work');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}
