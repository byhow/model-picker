import type { ModelRecord } from './model';

function priceSortValue(model: ModelRecord): number {
  const price = model.pricing.outputPerMillion;
  return Number.isFinite(price) && price >= 0 ? price : Number.POSITIVE_INFINITY;
}

export function rankModels(models: ModelRecord[]): ModelRecord[] {
  const ranked = [...models];

  const bySpeed = [...ranked].sort(
    (a, b) => (b.speed.bestThroughput || 0) - (a.speed.bestThroughput || 0),
  );
  bySpeed.forEach((model, index) => {
    const target = ranked.find((item) => item.id === model.id);
    if (target) target.rank.bySpeed = index + 1;
  });

  const byPrice = [...ranked].sort(
    (a, b) => priceSortValue(a) - priceSortValue(b),
  );
  byPrice.forEach((model, index) => {
    const target = ranked.find((item) => item.id === model.id);
    if (target) target.rank.byPrice = index + 1;
  });

  const byContext = [...ranked].sort(
    (a, b) => b.contextLength - a.contextLength,
  );
  byContext.forEach((model, index) => {
    const target = ranked.find((item) => item.id === model.id);
    if (target) target.rank.byContext = index + 1;
  });

  return ranked;
}
