import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import type { AppConfig } from '../config/env';

export interface QueryExecutor {
  query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

export type SqlExecutor = QueryExecutor | PoolClient;

export class Database {
  private readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      statement_timeout: config.databaseStatementTimeoutMs,
    });
  }

  query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
