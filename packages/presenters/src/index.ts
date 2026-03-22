import type { ModelRecord } from '@model-picker/domain';

export interface ModelRow {
  id: string;
  name: string;
  outputPrice: string;
  speed: string;
  context: string;
}

function formatOutputPrice(value: number): string {
  return Number.isFinite(value) && value >= 0 ? `$${value.toFixed(2)}/M` : 'N/A';
}

export function toModelRow(model: ModelRecord): ModelRow {
  return {
    id: model.id,
    name: model.name,
    outputPrice: formatOutputPrice(model.pricing.outputPerMillion),
    speed: model.speed.bestThroughput
      ? `${model.speed.bestThroughput.toFixed(0)} tok/s`
      : 'N/A',
    context:
      model.contextLength >= 1_000_000
        ? `${(model.contextLength / 1_000_000).toFixed(1)}M`
        : `${Math.round(model.contextLength / 1_000)}K`,
  };
}

export function formatModelSummary(model: ModelRecord): string {
  return [
    `${model.name} (${model.id})`,
    `Speed: ${model.speed.bestThroughput ? `${model.speed.bestThroughput.toFixed(1)} tok/s` : 'N/A'}`,
    `Output: ${formatOutputPrice(model.pricing.outputPerMillion)}`,
    `Context: ${model.contextLength.toLocaleString()} tokens`,
  ].join('\n');
}
