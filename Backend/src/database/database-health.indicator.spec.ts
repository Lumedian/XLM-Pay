import { DataSource } from 'typeorm';
import { DatabaseHealthIndicator } from './database-health.indicator';

describe('DatabaseHealthIndicator', () => {
  const buildIndicator = (queryImpl: jest.Mock) => {
    const dataSource = { query: queryImpl } as unknown as DataSource;
    return new DatabaseHealthIndicator(dataSource);
  };

  it('reports "up" when SELECT 1 succeeds', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const indicator = buildIndicator(query);

    const result = await indicator.isHealthy();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('reports "down" with the error message when the query fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection reset'));
    const indicator = buildIndicator(query);

    const result = await indicator.isHealthy();

    expect(result.database.status).toBe('down');
    expect(result.database.message).toBe('connection reset');
  });

  it('honours a custom key', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const indicator = buildIndicator(query);

    const result = await indicator.isHealthy('postgres');

    expect(result.postgres.status).toBe('up');
  });
});
