import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystemRegistry } from '../../src/registry/FileSystemRegistry';
import type { AgentInfo } from '../../src/registry/AgentRegistry';

describe('FileSystemRegistry', () => {
  let tmpDir: string;
  let registry: FileSystemRegistry;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-registry-'));
    registry = new FileSystemRegistry(path.join(tmpDir, 'agents.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('register', () => {
    it('registers a new agent and returns AgentInfo with generated id', async () => {
      const agent = await registry.register({
        name: 'Home Mac',
        publicUrl: 'wss://home.example.com:9800',
        ownerId: 'user-1',
        version: '0.1.0',
        platform: 'darwin-arm64',
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Home Mac');
      expect(agent.publicUrl).toBe('wss://home.example.com:9800');
      expect(agent.ownerId).toBe('user-1');
      expect(agent.status).toBe('online');
      expect(agent.lastSeen).toBeGreaterThan(0);
    });

    it('persists to disk', async () => {
      await registry.register({
        name: 'Test Agent',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const data = JSON.parse(await fs.readFile(path.join(tmpDir, 'agents.json'), 'utf-8'));
      expect(data.agents).toHaveLength(1);
      expect(data.agents[0].name).toBe('Test Agent');
    });

    it('creates parent directory if needed', async () => {
      const nestedPath = path.join(tmpDir, 'nested', 'dir', 'agents.json');
      const nestedRegistry = new FileSystemRegistry(nestedPath);

      await nestedRegistry.register({
        name: 'Nested Agent',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const data = JSON.parse(await fs.readFile(nestedPath, 'utf-8'));
      expect(data.agents).toHaveLength(1);
    });

    it('reuses existing agent if same publicUrl and ownerId', async () => {
      const agent1 = await registry.register({
        name: 'Agent V1',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const agent2 = await registry.register({
        name: 'Agent V2',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
        version: '0.2.0',
      });

      // Should reuse same ID, update name and version
      expect(agent2.id).toBe(agent1.id);
      expect(agent2.name).toBe('Agent V2');
      expect(agent2.version).toBe('0.2.0');
      expect(agent2.status).toBe('online');

      const agents = await registry.listByOwner('user-1');
      expect(agents).toHaveLength(1);
    });
  });

  describe('heartbeat', () => {
    it('updates lastSeen timestamp', async () => {
      const agent = await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const originalLastSeen = agent.lastSeen;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await registry.heartbeat(agent.id);

      const updated = await registry.get(agent.id);
      expect(updated!.lastSeen).toBeGreaterThanOrEqual(originalLastSeen);
      expect(updated!.status).toBe('online');
    });

    it('ignores unknown agent ID', async () => {
      // Should not throw
      await registry.heartbeat('nonexistent-id');
    });
  });

  describe('unregister', () => {
    it('marks agent as offline', async () => {
      const agent = await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      await registry.unregister(agent.id);

      const updated = await registry.get(agent.id);
      expect(updated!.status).toBe('offline');
    });

    it('ignores unknown agent ID', async () => {
      await registry.unregister('nonexistent-id');
    });
  });

  describe('listByOwner', () => {
    it('returns agents for a specific owner', async () => {
      await registry.register({ name: 'A1', publicUrl: 'wss://a1.com:9800', ownerId: 'user-1' });
      await registry.register({ name: 'A2', publicUrl: 'wss://a2.com:9800', ownerId: 'user-1' });
      await registry.register({ name: 'B1', publicUrl: 'wss://b1.com:9800', ownerId: 'user-2' });

      const user1Agents = await registry.listByOwner('user-1');
      expect(user1Agents).toHaveLength(2);
      expect(user1Agents.map((a) => a.name).sort()).toEqual(['A1', 'A2']);

      const user2Agents = await registry.listByOwner('user-2');
      expect(user2Agents).toHaveLength(1);
      expect(user2Agents[0].name).toBe('B1');
    });

    it('returns empty array for unknown owner', async () => {
      const agents = await registry.listByOwner('nobody');
      expect(agents).toEqual([]);
    });

    it('returns empty array when file does not exist', async () => {
      // Create a new registry with a non-existent file
      const nonExistentPath = path.join(tmpDir, 'never-created.json');
      const freshRegistry = new FileSystemRegistry(nonExistentPath);

      const agents = await freshRegistry.listByOwner('user-1');
      expect(agents).toEqual([]);
    });

    it('returns copies not references', async () => {
      await registry.register({
        name: 'Original',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const agents = await registry.listByOwner('user-1');
      expect(agents).toHaveLength(1);

      // Mutating the returned array should not affect stored data
      agents[0].name = 'Modified';

      const refetched = await registry.listByOwner('user-1');
      expect(refetched[0].name).toBe('Original');
    });
  });

  describe('get', () => {
    it('returns agent by ID', async () => {
      const agent = await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const found = await registry.get(agent.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(agent.id);
      expect(found!.name).toBe('Test');
    });

    it('returns null for unknown ID', async () => {
      const found = await registry.get('nonexistent');
      expect(found).toBeNull();
    });

    it('returns a copy not a reference', async () => {
      const agent = await registry.register({
        name: 'Test',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      const found = await registry.get(agent.id);
      expect(found).not.toBe(agent);

      // Mutating the returned object should not affect the stored agent
      found!.name = 'Modified';

      const refetched = await registry.get(agent.id);
      expect(refetched!.name).toBe('Test');
    });
  });

  describe('persistence', () => {
    it('survives reload from disk', async () => {
      const configPath = path.join(tmpDir, 'agents.json');
      const reg1 = new FileSystemRegistry(configPath);

      await reg1.register({
        name: 'Persistent',
        publicUrl: 'wss://test.com:9800',
        ownerId: 'user-1',
      });

      // Create new registry instance pointing to same file
      const reg2 = new FileSystemRegistry(configPath);
      const agents = await reg2.listByOwner('user-1');

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Persistent');
    });
  });
});
