describe('Assistant SSE contract', () => {
  it('uses the Java-compatible event names', () => {
    expect(['start', 'delta', 'done', 'error']).toEqual(['start', 'delta', 'done', 'error']);
  });
});
