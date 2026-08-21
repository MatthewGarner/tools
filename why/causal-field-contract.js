/* Public causal renderer: keeps the SVG's interaction contract explicit without
   giving the quiet hit planes visible containment. */
import {renderCausalField as renderBase} from './causal-field.js';

export function renderCausalField(model, projection, ctx, diff = null){
  return renderBase(model, projection, ctx, diff);
}
