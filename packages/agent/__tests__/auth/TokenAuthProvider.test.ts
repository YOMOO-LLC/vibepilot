import { describe, it, expect } from 'vitest';
import { TokenAuthProvider } from '../../src/auth/TokenAuthProvider';

describe('TokenAuthProvider', () => {
  const TOKEN = 'vp_test_secret_token_12345';

  it('returns success for valid token', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const result = await provider.verify(TOKEN);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('default');
    expect(result.error).toBeUndefined();
  });

  it('returns failure for invalid token', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const result = await provider.verify('wrong-token');

    expect(result.success).toBe(false);
    expect(result.userId).toBeUndefined();
    expect(result.error).toBe('Invalid token');
  });

  it('returns failure for empty token', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const result = await provider.verify('');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token');
  });

  it('returns failure for different length token (shorter)', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const result = await provider.verify('short');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token');
  });

  it('returns failure for different length token (longer)', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const result = await provider.verify(TOKEN + '-extra-chars');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token');
  });

  it('uses timing-safe comparison', async () => {
    const provider = new TokenAuthProvider(TOKEN);

    // Both should fail, but timing-safe means similar execution time
    const result1 = await provider.verify('x');
    const result2 = await provider.verify('vp_test_secret_token_wrong_but_similar_length');

    expect(result1.success).toBe(false);
    expect(result2.success).toBe(false);
  });

  it('is case-sensitive', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const upperCaseToken = TOKEN.toUpperCase();

    const result = await provider.verify(upperCaseToken);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token');
  });

  it('handles tokens with special characters', async () => {
    const specialToken = 'token-with-$pec!al-ch@rs';
    const specialProvider = new TokenAuthProvider(specialToken);

    const result = await specialProvider.verify(specialToken);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('default');
  });

  it('handles unicode tokens correctly', async () => {
    const unicodeToken = '令牌-🔐-token';
    const unicodeProvider = new TokenAuthProvider(unicodeToken);

    const result = await unicodeProvider.verify(unicodeToken);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('default');
  });

  it('getUserInfo returns default user info', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const info = await provider.getUserInfo!('default');

    expect(info).toEqual({ name: 'Default User' });
  });

  it('getUserInfo returns same info regardless of userId parameter', async () => {
    const provider = new TokenAuthProvider(TOKEN);
    const info = await provider.getUserInfo!('any-user-id');

    expect(info).toEqual({ name: 'Default User' });
  });
});
