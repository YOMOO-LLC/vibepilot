import * as jose from 'jose';
import type { AuthProvider, AuthResult, UserInfo } from './AuthProvider.js';

/**
 * Supabase-based authentication provider.
 *
 * Primary: JWKS verification (production Supabase with RS256).
 * Fallback: /auth/v1/user endpoint (local Supabase with HS256, where JWKS is empty).
 */
export class SupabaseAuthProvider implements AuthProvider {
  private supabaseUrl: string;
  private jwks: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(supabaseUrl: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');

    const jwksUrl = new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    this.jwks = jose.createRemoteJWKSet(jwksUrl);
  }

  async verify(jwt: string): Promise<AuthResult> {
    // Try JWKS verification first (works with production Supabase using RS256)
    try {
      const { payload } = await jose.jwtVerify(jwt, this.jwks, {
        issuer: `${this.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });

      const userId = payload.sub;
      if (!userId) {
        return { success: false, error: 'Token missing subject claim' };
      }

      return { success: true, userId };
    } catch {
      // JWKS verification failed (e.g., local Supabase with empty JWKS).
      // Fall back to the /auth/v1/user endpoint.
    }

    return this.verifyViaUserEndpoint(jwt);
  }

  /**
   * Verify a JWT by calling the Supabase /auth/v1/user endpoint.
   * This works with both local (HS256) and production (RS256) Supabase.
   */
  private async verifyViaUserEndpoint(jwt: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: jwt,
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (!response.ok) {
        return { success: false, error: `Auth endpoint returned ${response.status}` };
      }

      const data = (await response.json()) as { id?: string; email?: string };
      if (!data.id) {
        return { success: false, error: 'No user ID in response' };
      }

      return { success: true, userId: data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'User endpoint verification failed';
      return { success: false, error: message };
    }
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY || '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY || ''}`,
        },
      });

      if (!response.ok) {
        return {};
      }

      const data = (await response.json()) as {
        user_metadata?: { full_name?: string };
        email?: string;
      };
      return {
        name: data.user_metadata?.full_name || data.email?.split('@')[0],
        email: data.email,
      };
    } catch {
      return {};
    }
  }
}
