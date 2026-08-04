/* Pure policy for the trip trace: ambient/system motion preferences always win. */

export function traceMotionMode({reduced = false, hidden = false, animate = true} = {}){
  return reduced || hidden || !animate ? 'still' : 'animate';
}
