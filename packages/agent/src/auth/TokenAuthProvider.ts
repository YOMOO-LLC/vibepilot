import { timingSafeEqual } from 'crypto';
import type { AuthProvider, AuthResult, UserInfo } from './AuthProvider.js';

/**
 * Simple token-based authentication for single-user mode.
 *
 * Compares the provided credentials against a static token
 * using timing-safe comparison to prevent timing attacks.
 */
export class TokenAuthProvider implements AuthProvider {
  private tokenBuffer: Buffer;

  constructor(token: string) {
    this.tokenBuffer = Buffer.from(token);
  }

  async verify(credentials: string): Promise<AuthResult> {
    const credBuffer = Buffer.from(credentials);

    // Timing-safe comparison requires equal-length buffers.
    // If lengths differ, we still do a comparison against the token
    // to avoid leaking length information via timing.
    let isValid: boolean;
    if (credBuffer.length === this.tokenBuffer.length) {
      isValid = timingSafeEqual(credBuffer, this.tokenBuffer);
    } else {
      // Compare against self to consume similar time, then reject
      timingSafeEqual(this.tokenBuffer, this.tokenBuffer);
      isValid = false;
    }

    if (isValid) {
      return { success: true, userId: 'default' };
    }
    return { success: false, error: 'Invalid token' };
  }

  async getUserInfo(_userId: string): Promise<UserInfo> {
    return { name: 'Default User' };
  }
}
