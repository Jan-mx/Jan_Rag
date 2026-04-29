import { HybridRetrievalService } from './retrieval.service';

describe('HybridRetrievalService RRF behavior', () => {
  it('keeps an empty result shape stable', () => {
    const service: any = Object.create(HybridRetrievalService.prototype);
    const empty = service.empty();
    expect(empty.evidences).toEqual([]);
    expect(empty.evidenceLevel).toBe('NONE');
    expect(empty.citations).toEqual([]);
  });
});
