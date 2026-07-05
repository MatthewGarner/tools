/* Pure batch-size economics (Reinertsen ch.5 / EOQ): per-item cost at batch B is
   transaction T/B (falls) + holding h·B/(2λ) (average wait for the batch to fill,
   priced at the cost of delay). No DOM, no simulation — closed-form arithmetic. */

export function batchEconomics({demandPerWeek, transactionCost, holdCostPerItemWeek, currentBatch, maxBatch = 30}){
  const perItem = B => transactionCost / B + holdCostPerItemWeek * B / (2 * demandPerWeek);
  const curve = [];
  let optimum = 1;
  for(let B = 1; B <= maxBatch; B++){
    const transaction = transactionCost / B;
    const holding = holdCostPerItemWeek * B / (2 * demandPerWeek);
    curve.push({batch: B, transaction, holding, total: transaction + holding});
    if(curve[B - 1].total < curve[optimum - 1].total) optimum = B;
  }
  const penaltyPerItem = perItem(currentBatch) - perItem(optimum);
  return {
    curve,
    optimum,
    optimumWeeks: optimum / demandPerWeek,
    optimumCost: perItem(optimum),
    currentBatch,
    currentCost: perItem(currentBatch),
    penaltyPerItem,
    penaltyPerWeek: penaltyPerItem * demandPerWeek,
  };
}
