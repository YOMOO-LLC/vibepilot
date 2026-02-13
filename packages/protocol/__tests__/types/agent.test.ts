import { describe, it, expect } from 'vitest';
import type { AgentMetadata, AgentPresence } from '../../src/types/agent';

describe('Agent Types', () => {
  it('should define AgentMetadata interface', () => {
    const metadata: AgentMetadata = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ownerId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'test-project',
      platform: 'darwin',
      version: '0.1.0',
      projectPath: '/Users/test/project',
      tags: ['web', 'typescript'],
      createdAt: '2026-02-13T00:00:00Z',
      lastSeen: '2026-02-13T00:00:00Z',
      publicKey: 'ssh-rsa AAAAB3...',
    };

    expect(metadata.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(metadata.platform).toBe('darwin');
  });

  it('should define AgentPresence interface', () => {
    const presence: AgentPresence = {
      agentId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'test-project',
      platform: 'darwin',
      publicKey: 'ssh-rsa AAAAB3...',
      onlineAt: '2026-02-13T00:00:00Z',
    };

    expect(presence.agentId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(presence.onlineAt).toBeDefined();
  });

  it('should allow optional fields to be omitted in AgentMetadata', () => {
    const metadata: AgentMetadata = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ownerId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'test-project',
      platform: 'darwin',
      version: '0.1.0',
      projectPath: '/Users/test/project',
      createdAt: '2026-02-13T00:00:00Z',
      lastSeen: '2026-02-13T00:00:00Z',
      // tags and publicKey intentionally omitted
    };

    expect(metadata.tags).toBeUndefined();
    expect(metadata.publicKey).toBeUndefined();
  });

  it('should allow publicKey to be omitted in AgentPresence', () => {
    const presence: AgentPresence = {
      agentId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'test-project',
      platform: 'darwin',
      onlineAt: '2026-02-13T00:00:00Z',
      // publicKey intentionally omitted
    };

    expect(presence.publicKey).toBeUndefined();
  });
});
