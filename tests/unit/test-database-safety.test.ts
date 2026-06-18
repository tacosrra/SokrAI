import { describe, expect, it } from 'vitest';

import {
  assertSafeTestDatabaseUrl,
  createTestConfig,
  DEFAULT_TEST_DATABASE_URL,
} from '../helpers/test-environment';

describe('test database safety', () => {
  it('uses an isolated test database by default', () => {
    const previousTestDatabaseUrl = process.env.TEST_DATABASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL;

    delete process.env.TEST_DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      expect(createTestConfig().databaseUrl).toBe(DEFAULT_TEST_DATABASE_URL);
    } finally {
      restoreEnvValue('TEST_DATABASE_URL', previousTestDatabaseUrl);
      restoreEnvValue('DATABASE_URL', previousDatabaseUrl);
    }
  });

  it('refuses to reset the local development database', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://sokrai_app:localpass@localhost:5433/sokrai_app'),
    ).toThrow(/Refusing to reset non-test database/);
  });

  it('allows resetting an explicit test database', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://sokrai_test:localpass@localhost:5433/sokrai_test'),
    ).not.toThrow();
  });
});

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
