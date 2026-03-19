export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
  };
}

export interface SpeedProvider {
  name: string;
  throughput: number | null;
  latency: number | null;
}

export interface ModelRecord {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  topProvider: {
    contextLength: number;
    maxCompletionTokens: number | null;
    isModerated: boolean;
  };
  architecture: {
    modality: string;
    inputModalities: string[];
    outputModalities: string[];
  };
  speed: {
    providers: SpeedProvider[];
    bestThroughput: number | null;
    avgThroughput: number | null;
  };
  rank: {
    bySpeed: number;
    byPrice: number;
    byContext: number;
  };
}

export interface ModelSnapshot {
  generatedAt: string;
  count: number;
  models: ModelRecord[];
}

export interface CompactModelRecord {
  id: string;
  name: string;
  contextLength: number;
  outputPerMillion: number;
  bestThroughput: number | null;
  rank: ModelRecord['rank'];
}

export interface CompactSnapshot {
  generatedAt: string;
  count: number;
  models: CompactModelRecord[];
}
