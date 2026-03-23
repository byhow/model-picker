import { describe, expect, test } from 'bun:test';
import {
  buildOpenRouterFrontendModelsUrl,
  buildOpenRouterEndpointStatsUrl,
  extractOpenRouterCategoryLabels,
  type OpenRouterFrontendCategoryEntry,
} from './openrouter-frontend';

describe('openrouter-frontend', () => {
  describe('buildOpenRouterFrontendModelsUrl', () => {
    test('builds URL with default options', () => {
      const url = buildOpenRouterFrontendModelsUrl();
      expect(url).toContain('https://openrouter.ai/api/frontend/models/find');
      expect(url).toContain('fmt=cards');
      expect(url).toContain('order=most-popular');
    });

    test('builds URL with custom order', () => {
      const url = buildOpenRouterFrontendModelsUrl({ order: 'newest' });
      expect(url).toContain('order=newest');
    });

    test('builds URL with query string', () => {
      const url = buildOpenRouterFrontendModelsUrl({ q: 'claude' });
      expect(url).toContain('q=claude');
    });

    test('trims whitespace from query', () => {
      const url = buildOpenRouterFrontendModelsUrl({ q: '  claude  ' });
      expect(url).toContain('q=claude');
      expect(url).not.toContain('q=  claude  ');
    });

    test('builds URL with input modalities', () => {
      const url = buildOpenRouterFrontendModelsUrl({ inputModalities: ['text', 'image'] });
      expect(url).toContain('input_modalities=text%2Cimage');
    });

    test('builds URL with output modalities', () => {
      const url = buildOpenRouterFrontendModelsUrl({ outputModalities: ['text'] });
      expect(url).toContain('output_modalities=text');
    });

    test('builds URL with categories', () => {
      const url = buildOpenRouterFrontendModelsUrl({ categories: ['programming', 'coding'] });
      expect(url).toContain('categories=programming%2Ccoding');
    });

    test('builds URL with maxPrice', () => {
      const url = buildOpenRouterFrontendModelsUrl({ maxPrice: 5.5 });
      expect(url).toContain('max_price=5.5');
    });

    test('ignores non-finite maxPrice', () => {
      const url1 = buildOpenRouterFrontendModelsUrl({ maxPrice: Number.POSITIVE_INFINITY });
      const url2 = buildOpenRouterFrontendModelsUrl({ maxPrice: Number.NaN });
      expect(url1).not.toContain('max_price');
      expect(url2).not.toContain('max_price');
    });

    test('builds URL with zdr flag', () => {
      const url = buildOpenRouterFrontendModelsUrl({ zdr: true });
      expect(url).toContain('zdr=true');
    });

    test('omits zdr when false', () => {
      const url = buildOpenRouterFrontendModelsUrl({ zdr: false });
      expect(url).not.toContain('zdr');
    });

    test('builds URL with all options', () => {
      const url = buildOpenRouterFrontendModelsUrl({
        order: 'top-weekly',
        q: 'gpt',
        inputModalities: ['text'],
        outputModalities: ['text'],
        categories: ['chat'],
        maxPrice: 10,
        zdr: true,
      });
      expect(url).toContain('order=top-weekly');
      expect(url).toContain('q=gpt');
      expect(url).toContain('input_modalities=text');
      expect(url).toContain('output_modalities=text');
      expect(url).toContain('categories=chat');
      expect(url).toContain('max_price=10');
      expect(url).toContain('zdr=true');
    });

    test('ignores empty arrays for modalities', () => {
      const url = buildOpenRouterFrontendModelsUrl({ inputModalities: [] });
      expect(url).not.toContain('input_modalities');
    });

    test('ignores empty arrays for categories', () => {
      const url = buildOpenRouterFrontendModelsUrl({ categories: [] });
      expect(url).not.toContain('categories');
    });

    test('ignores whitespace-only query', () => {
      const url = buildOpenRouterFrontendModelsUrl({ q: '   ' });
      expect(url).not.toContain('q=');
    });
  });

  describe('buildOpenRouterEndpointStatsUrl', () => {
    test('builds URL with permaslug', () => {
      const url = buildOpenRouterEndpointStatsUrl('anthropic/claude-opus-4');
      expect(url).toBe(
        'https://openrouter.ai/api/frontend/stats/endpoint?permaslug=anthropic%2Fclaude-opus-4&variant=standard',
      );
    });

    test('builds URL with custom variant', () => {
      const url = buildOpenRouterEndpointStatsUrl('openai/gpt-4', 'extended');
      expect(url).toContain('variant=extended');
    });

    test('uses standard variant by default', () => {
      const url = buildOpenRouterEndpointStatsUrl('google/gemini-pro');
      expect(url).toContain('variant=standard');
    });
  });

  describe('extractOpenRouterCategoryLabels', () => {
    test('returns empty array for undefined input', () => {
      expect(extractOpenRouterCategoryLabels(undefined)).toEqual([]);
    });

    test('returns empty array for empty array', () => {
      expect(extractOpenRouterCategoryLabels([])).toEqual([]);
    });

    test('extracts and formats category labels', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'programming', rank: 5 },
        { category: 'finance', rank: 10 },
        { category: 'legal', rank: 15 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Programming', 'Finance', 'Legal']);
    });

    test('sorts by rank ascending', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'finance', rank: 10 },
        { category: 'programming', rank: 5 },
        { category: 'legal', rank: 15 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Programming', 'Finance', 'Legal']);
    });

    test('sorts alphabetically for same rank', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'zebra', rank: 5 },
        { category: 'apple', rank: 5 },
        { category: 'banana', rank: 5 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Apple', 'Banana', 'Zebra']);
    });

    test('keeps entry with lower rank for duplicate categories', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'programming', rank: 10 },
        { category: 'programming', rank: 2 },
        { category: 'programming', rank: 20 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Programming']);
    });

    test('handles nested category paths', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'code/javascript', rank: 1 },
        { category: 'code/python', rank: 2 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Code/Javascript', 'Code/Python']);
    });

    test('handles hyphenated categories', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'machine-learning', rank: 1 },
        { category: 'natural-language-processing', rank: 2 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Machine-Learning', 'Natural-Language-Processing']);
    });

    test('skips entries with empty category', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'programming', rank: 1 },
        { category: '', rank: 2 },
        { category: '  ', rank: 3 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Programming']);
    });

    test('handles single segment categories', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'academia', rank: 1 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Academia']);
    });

    test('handles mixed case categories', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: 'programming', rank: 1 },
        { category: 'Machine-Learning', rank: 2 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toEqual(['Programming', 'Machine-Learning']);
    });

    test('handles categories with special characters', () => {
      const entries: OpenRouterFrontendCategoryEntry[] = [
        { category: "women's-health", rank: 1 },
        { category: 'c++', rank: 2 },
      ];
      const labels = extractOpenRouterCategoryLabels(entries);
      expect(labels).toContain("Women's-Health");
      expect(labels).toContain('C++');
    });
  });
});
