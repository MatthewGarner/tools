/* Public Delivery Lens renderer: readiness is derived from the Why projection. */
import {renderReadinessLedger} from './readiness-ledger.js';
import {renderReadinessPresentation} from './readiness-presentation.js';

export function renderDeliveryLens(model, projection, ctx, diff = null){
  return ctx.intent === 'presentation'
    ? renderReadinessPresentation(model, projection, ctx, diff)
    : renderReadinessLedger(model, projection, ctx, diff);
}
