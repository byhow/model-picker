import type { ModelRecord } from '@model-picker/domain';

export interface ModelRow {
  id: string;
  name: string;
  outputPrice: string;
  speed: string;
  context: string;
}

export function toModelRow(model: ModelRecord): ModelRow {
  return {
    id: model.id,
    name: model.name,
    outputPrice: `$${model.pricing.outputPerMillion.toFixed(2)}/M`,
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
    `Output: $${model.pricing.outputPerMillion.toFixed(2)}/M`,
    `Context: ${model.contextLength.toLocaleString()} tokens`,
  ].join('\n');
}
