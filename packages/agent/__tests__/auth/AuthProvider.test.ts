import { describe, it, expect } from 'vitest';
import type { AuthProvider, AuthResult } from '../../src/auth/AuthProvider';

describe('AuthProvider interface', () => {
  it('can be implemented with custom logic', async () => {
    const mockProvider: AuthProvider = {
      verify: async (credentials: string): Promise<AuthResult> => {
        if (credentials === 'magic') {
          return { success: true, userId: 'user-42' };
        }
        return { success: false, error: 'Nope' };
      },
    };

    const successResult = await mockProvider.verify('magic');
    expect(successResult.success).toBe(true);
    expect(successResult.userId).toBe('user-42');

    const failResult = await mockProvider.verify('wrong');
    expect(failResult.success).toBe(false);
    expect(failResult.error).toBe('Nope');
  });

  it('supports optional getUserInfo', async () => {
    const provider: AuthProvider = {
      verify: async () => ({ success: true, userId: 'u1' }),
      getUserInfo: async (userId: string) => ({
        name: `User ${userId}`,
        email: `${userId}@test.com`,
      }),
    };

    const info = await provider.getUserInfo!('u1');
    expect(info.name).toBe('User u1');
    expect(info.email).toBe('u1@test.com');
  });
});
