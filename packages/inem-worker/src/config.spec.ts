import { loadConfig, MissingConfigError } from './config';

const BASE_ENV = {
  BACKEND_URL: 'http://backend:3000/',
  INEM_WORKER_TOKEN: 'secret-token',
  INEM_USERNAME: 'delegation',
  INEM_PASSWORD: 'hunter2',
};

describe('loadConfig', () => {
  it('reads the required vars and applies defaults for the optional ones', () => {
    const config = loadConfig(BASE_ENV);
    expect(config).toEqual({
      backendUrl: 'http://backend:3000', // trailing slash stripped
      workerToken: 'secret-token',
      inemBaseUrl: 'https://portalpem.inem.pt',
      username: 'delegation',
      password: 'hunter2',
      pollIntervalMs: 15_000,
    });
  });

  it('honours an overridden INEM_BASE_URL and poll interval', () => {
    const config = loadConfig({ ...BASE_ENV, INEM_BASE_URL: 'https://test.inem.pt/', INEM_WORKER_POLL_INTERVAL_MS: '5000' });
    expect(config.inemBaseUrl).toBe('https://test.inem.pt');
    expect(config.pollIntervalMs).toBe(5000);
  });

  it.each(['BACKEND_URL', 'INEM_WORKER_TOKEN', 'INEM_USERNAME', 'INEM_PASSWORD'])('throws MissingConfigError when %s is missing', (key) => {
    const env = { ...BASE_ENV };
    delete (env as Record<string, string | undefined>)[key];
    expect(() => loadConfig(env)).toThrow(MissingConfigError);
  });
});
