import { InvalidClientMetadataError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { RedinfoClientsStore } from './oauth-clients.store';

function makeStore() {
  const prisma = { oAuthClient: { findUnique: jest.fn(), create: jest.fn() } };
  const identityCipher = { seal: jest.fn(), open: jest.fn() };
  const store = new RedinfoClientsStore(prisma as never, identityCipher as never);
  return { store, prisma, identityCipher };
}

describe('RedinfoClientsStore', () => {
  describe('registerClient', () => {
    it('refuses a confidential client (anything but token_endpoint_auth_method: "none")', async () => {
      const { store } = makeStore();

      await expect(
        store.registerClient({
          redirect_uris: ['https://assistant.example/callback'],
          token_endpoint_auth_method: 'client_secret_post',
        } as never),
      ).rejects.toBeInstanceOf(InvalidClientMetadataError);
    });

    it('refuses a client with no redirect_uris', async () => {
      const { store } = makeStore();

      await expect(store.registerClient({ redirect_uris: [] } as never)).rejects.toBeInstanceOf(
        InvalidClientMetadataError,
      );
    });

    it('persists a public client and hands back the same shape the SDK gave it', async () => {
      const { store, prisma } = makeStore();
      prisma.oAuthClient.create.mockResolvedValue(undefined);

      const result = await store.registerClient({
        client_id: 'c-1',
        client_id_issued_at: 1,
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/callback'],
        token_endpoint_auth_method: 'none',
      } as never);

      expect(prisma.oAuthClient.create).toHaveBeenCalledWith({
        data: {
          clientId: 'c-1',
          clientName: 'Claude',
          redirectUris: ['https://claude.ai/callback'],
          isDynamic: true,
        },
      });
      expect(result.client_id).toBe('c-1');
    });
  });

  describe('getClient', () => {
    it('returns undefined for an unknown client', async () => {
      const { store, prisma } = makeStore();
      prisma.oAuthClient.findUnique.mockResolvedValue(null);

      expect(await store.getClient('nope')).toBeUndefined();
    });

    it('returns undefined for a disabled client', async () => {
      const { store, prisma } = makeStore();
      prisma.oAuthClient.findUnique.mockResolvedValue({ disabledAt: new Date() });

      expect(await store.getClient('c-1')).toBeUndefined();
    });

    it('opens the sealed secret for a confidential client', async () => {
      const { store, prisma, identityCipher } = makeStore();
      const sealed = Buffer.from('sealed');
      prisma.oAuthClient.findUnique.mockResolvedValue({
        id: 'row-1',
        clientId: 'c-1',
        clientName: 'Copilot Studio',
        redirectUris: ['https://copilotstudio.example/callback'],
        clientSecretSealed: sealed,
        createdAt: new Date(),
        disabledAt: null,
      });
      identityCipher.open.mockReturnValue('the-plaintext-secret');

      const info = await store.getClient('c-1');

      expect(identityCipher.open).toHaveBeenCalledWith('oauth-client-secret', 'row-1', sealed);
      expect(info?.client_secret).toBe('the-plaintext-secret');
      expect(info?.token_endpoint_auth_method).toBe('client_secret_post');
    });

    it('reports token_endpoint_auth_method "none" for a public client', async () => {
      const { store, prisma } = makeStore();
      prisma.oAuthClient.findUnique.mockResolvedValue({
        id: 'row-1',
        clientId: 'c-1',
        clientName: 'Claude',
        redirectUris: ['https://claude.ai/callback'],
        clientSecretSealed: null,
        createdAt: new Date(),
        disabledAt: null,
      });

      const info = await store.getClient('c-1');

      expect(info?.client_secret).toBeUndefined();
      expect(info?.token_endpoint_auth_method).toBe('none');
    });
  });
});
