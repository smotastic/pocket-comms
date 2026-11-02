import { describe, expect, it } from '@effect/vitest';
import { createModels, type OAuthCredential } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { homedir } from 'node:os';
import { makePiAuthFile, piAuthFilePath } from './pi-auth-file.js';

const tempFile = async (content?: unknown) => {
  const path = join(await mkdtemp(join(tmpdir(), 'pi-auth-')), 'auth.json');
  if (content !== undefined)
    await writeFile(path, JSON.stringify(content, null, 2), { mode: 0o600 });
  return path;
};

const login = (access: string, expires: number): OAuthCredential => ({
  type: 'oauth',
  access,
  refresh: `refresh-of-${access}`,
  expires,
});

const contentOf = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, 'utf8'));

describe("the store over Pi's credential file", () => {
  it('reads the stored login of a provider, and lists without secrets', async () => {
    const path = await tempFile({
      openai: login('a-1', 1),
      anthropic: { type: 'api_key', key: 'k' },
    });
    const store = makePiAuthFile(path);
    expect(await store.read('openai')).toEqual(login('a-1', 1));
    expect(await store.read('google')).toBeUndefined();
    expect(await store.list()).toEqual([
      { providerId: 'openai', type: 'oauth' },
      { providerId: 'anthropic', type: 'api_key' },
    ]);
  });

  it('treats a missing file as no credentials and does not create it on a read', async () => {
    const path = await tempFile();
    const store = makePiAuthFile(path);
    expect(await store.read('openai')).toBeUndefined();
    expect(await store.list()).toEqual([]);
    await expect(stat(path)).rejects.toThrow();
  });

  it('refuses a file that is not an object of credentials', async () => {
    const path = await tempFile(['no']);
    await expect(makePiAuthFile(path).read('openai')).rejects.toThrow(path);
  });

  it('writes a new login, keeping the other providers and the private mode', async () => {
    const path = await tempFile({
      openai: login('a-1', 1),
      anthropic: { type: 'api_key', key: 'k' },
    });
    const store = makePiAuthFile(path);
    const written = await store.modify('openai', async (current) =>
      current?.type === 'oauth' ? login('a-2', 2) : undefined,
    );
    expect(written).toEqual(login('a-2', 2));
    expect(await contentOf(path)).toEqual({
      openai: login('a-2', 2),
      anthropic: { type: 'api_key', key: 'k' },
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('leaves the file alone when nothing changes, and deletes one provider', async () => {
    const path = await tempFile({
      openai: login('a-1', 1),
      anthropic: { type: 'api_key', key: 'k' },
    });
    const store = makePiAuthFile(path);
    expect(await store.modify('openai', async () => undefined)).toEqual(login('a-1', 1));
    await store.delete('openai');
    expect(await contentOf(path)).toEqual({ anthropic: { type: 'api_key', key: 'k' } });
  });

  it('waits for the lock the Pi CLI holds before it writes', async () => {
    const path = await tempFile({ openai: login('a-1', 1) });
    const release = await lockfile.lock(path, { realpath: false });
    const store = makePiAuthFile(path);
    let done = false;
    const writing = store
      .modify('openai', async (current) =>
        current?.type === 'oauth' ? login(`after-${current.access}`, 2) : undefined,
      )
      .then(() => {
        done = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(done).toBe(false);
    await writeFile(path, JSON.stringify({ openai: login('by-pi', 3) }));
    await release();
    await writing;
    // The write saw what the lock holder wrote, not a stale copy.
    expect(await contentOf(path)).toEqual({ openai: login('after-by-pi', 2) });
  });

  it('refreshes an expired login, saves it, and sends the refreshed token', async () => {
    const path = await tempFile({ faux: login('old', Date.now() - 1000) });
    const faux = fauxProvider();
    const sent: Array<string | undefined> = [];
    faux.setResponses([
      (_context, options) => {
        sent.push(options?.apiKey);
        return fauxAssistantMessage('Namaskara');
      },
    ]);
    const models = createModels({ credentials: makePiAuthFile(path) });
    models.setProvider({
      ...faux.provider,
      auth: {
        oauth: {
          name: 'Faux subscription',
          login: () => Promise.reject(new Error('no login in tests')),
          refresh: async () => login('new', Date.now() + 3_600_000),
          toAuth: async (credential) => ({ apiKey: credential.access }),
        },
      },
    });
    const reply = await models.completeSimple(faux.getModel(), {
      messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }],
    });
    expect(reply.stopReason).toBe('stop');
    expect(sent).toEqual(['new']);
    expect((await contentOf(path))['faux']).toMatchObject({ type: 'oauth', access: 'new' });
  });

  it('refreshes once when two stores refresh the same login at the same time', async () => {
    const path = await tempFile({ openai: login('old', 1) });
    let refreshes = 0;
    const refresh = (store: ReturnType<typeof makePiAuthFile>) =>
      store.modify('openai', async (current) => {
        if (current?.type !== 'oauth' || current.access !== 'old') return undefined;
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return login('new', 2);
      });
    await Promise.all([refresh(makePiAuthFile(path)), refresh(makePiAuthFile(path))]);
    expect(refreshes).toBe(1);
    expect(await contentOf(path)).toEqual({ openai: login('new', 2) });
  });

  it('creates a missing file privately on the first write', async () => {
    const path = await tempFile();
    await makePiAuthFile(path).modify('openai', async () => login('a-1', 1));
    expect(await contentOf(path)).toEqual({ openai: login('a-1', 1) });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('leaves the file untouched when a refresh fails', async () => {
    const path = await tempFile({ openai: login('a-1', 1) });
    const store = makePiAuthFile(path);
    await expect(
      store.modify('openai', () => Promise.reject(new Error('invalid_grant'))),
    ).rejects.toThrow('invalid_grant');
    expect(await contentOf(path)).toEqual({ openai: login('a-1', 1) });
    expect(await lockfile.check(path, { realpath: false })).toBe(false);
  });

  it('keeps an entry of a kind it does not know, and still reads the others', async () => {
    const future = { type: 'passkey', id: 'x' };
    const path = await tempFile({ openai: login('a-1', 1), other: future });
    const store = makePiAuthFile(path);
    expect(await store.read('openai')).toEqual(login('a-1', 1));
    await expect(store.read('other')).rejects.toThrow('other');
    expect(await store.list()).toEqual([{ providerId: 'openai', type: 'oauth' }]);
    await store.modify('openai', async () => login('a-2', 2));
    expect(await contentOf(path)).toEqual({ openai: login('a-2', 2), other: future });
  });

  it('reads past a moment where Pi is still writing the file', async () => {
    const path = await tempFile();
    await writeFile(path, '');
    const reading = makePiAuthFile(path).read('openai');
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(path, JSON.stringify({ openai: login('a-1', 1) }));
    expect(await reading).toEqual(login('a-1', 1));
  });

  it('stops waiting for the lock when the request is cancelled', async () => {
    const path = await tempFile({ openai: login('a-1', 1) });
    const release = await lockfile.lock(path, { realpath: false });
    const cancel = new AbortController();
    let called = false;
    const writing = makePiAuthFile(path).modify(
      'openai',
      async () => {
        called = true;
        return login('a-2', 2);
      },
      { signal: cancel.signal },
    );
    setTimeout(() => cancel.abort(new Error('cancelled')), 50);
    await expect(writing).rejects.toThrow('cancelled');
    await release();
    expect(called).toBe(false);
    expect(await contentOf(path)).toEqual({ openai: login('a-1', 1) });
  });
});

describe("where Pi's credential file is", () => {
  it("is Pi's agent directory, and follows PI_CODING_AGENT_DIR", () => {
    expect(piAuthFilePath({})).toBe(join(homedir(), '.pi', 'agent', 'auth.json'));
    expect(piAuthFilePath({ agentDir: '~/pi-work' })).toBe(join(homedir(), 'pi-work', 'auth.json'));
  });

  it('is the configured file, with a leading ~ meaning the home directory', () => {
    expect(piAuthFilePath({ file: '~/x/auth.json', agentDir: '/ignored' })).toBe(
      join(homedir(), 'x', 'auth.json'),
    );
    expect(piAuthFilePath({ file: '/etc/pi/auth.json' })).toBe('/etc/pi/auth.json');
  });
});
