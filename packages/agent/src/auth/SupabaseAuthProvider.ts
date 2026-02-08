import * as jose from 'jose';
import type { AuthProvider, AuthResult, UserInfo } from './AuthProvider.js';

/**
 * Supabase-based authentication provider.
 *
 * Verifies JWTs issued by Supabase Auth using the project's JWKS endpoint.
 * This avoids requiring the Supabase service key on the agent — only the
 * public URL is needed to fetch the JSON Web Key Set.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private supabaseUrl: string;
  private jwks: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(supabaseUrl: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');

    // Supabase exposes JWKS at a well-known endpoint
    const jwksUrl = new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    this.jwks = jose.createRemoteJWKSet(jwksUrl);
  }

  async verify(jwt: string): Promise<AuthResult> {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JWT verification failed';
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

      const data = await response.json();
      return {
        name: data.user_metadata?.full_name || data.email?.split('@')[0],
        email: data.email,
      };
    } catch {
      return {};
    }
  }
}
