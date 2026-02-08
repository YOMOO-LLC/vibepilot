/**
 * Result of an authentication verification.
 */
export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * User information returned by the auth provider.
 */
export interface UserInfo {
  name?: string;
  email?: string;
}

/**
 * Pluggable authentication provider interface.
 *
 * Implementations:
 * - TokenAuthProvider: simple static token (single-user mode)
 * - LocalAuthProvider: username/password + JWT (multi-user mode)
 * - SupabaseAuthProvider: Supabase Auth integration (cloud mode)
 */
export interface AuthProvider {
  /**
   * Verify credentials (token, JWT, etc.) from a WebSocket connection.
   */
  verify(credentials: string): Promise<AuthResult>;

  /**
   * Optional: retrieve user information by user ID.
   */
  getUserInfo?(userId: string): Promise<UserInfo>;
}
