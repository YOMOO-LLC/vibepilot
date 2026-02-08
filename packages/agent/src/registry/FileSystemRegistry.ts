import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { AgentInfo, AgentRegistration, AgentRegistry } from './AgentRegistry';

interface RegistryData {
  version: string;
  agents: AgentInfo[];
}

/**
 * File-system-based agent registry for single-user mode.
 *
 * Stores agent records in a JSON file at the configured path.
 * Each read/write operation loads from / saves to disk to
 * support multiple processes accessing the same file.
 */
export class FileSystemRegistry implements AgentRegistry {
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
  }

  async register(input: AgentRegistration): Promise<AgentInfo> {
    const data = await this.load();

    // Check for existing agent with same publicUrl + ownerId
    const existingIndex = data.agents.findIndex(
      (a) => a.publicUrl === input.publicUrl && a.ownerId === input.ownerId
    );

    const now = Date.now();

    if (existingIndex >= 0) {
      // Update existing agent
      const existing = data.agents[existingIndex];
      existing.name = input.name;
      existing.status = 'online';
      existing.lastSeen = now;
      if (input.version !== undefined) existing.version = input.version;
      if (input.platform !== undefined) existing.platform = input.platform;
      if (input.metadata !== undefined) existing.metadata = input.metadata;

      await this.save(data);
      return { ...existing };
    }

    // Create new agent
    const agent: AgentInfo = {
      id: randomUUID(),
      name: input.name,
      publicUrl: input.publicUrl,
      ownerId: input.ownerId,
      status: 'online',
      lastSeen: now,
      version: input.version,
      platform: input.platform,
      metadata: input.metadata,
    };

    data.agents.push(agent);
    await this.save(data);
    return { ...agent };
  }

  async heartbeat(agentId: string): Promise<void> {
    const data = await this.load();
    const agent = data.agents.find((a) => a.id === agentId);
    if (!agent) return;

    agent.lastSeen = Date.now();
    agent.status = 'online';
    await this.save(data);
  }

  async unregister(agentId: string): Promise<void> {
    const data = await this.load();
    const agent = data.agents.find((a) => a.id === agentId);
    if (!agent) return;

    agent.status = 'offline';
    await this.save(data);
  }

  async listByOwner(ownerId: string): Promise<AgentInfo[]> {
    const data = await this.load();
    return data.agents.filter((a) => a.ownerId === ownerId).map((a) => ({ ...a }));
  }

  async get(agentId: string): Promise<AgentInfo | null> {
    const data = await this.load();
    const agent = data.agents.find((a) => a.id === agentId);
    return agent ? { ...agent } : null;
  }

  private async load(): Promise<RegistryData> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(raw) as RegistryData;
    } catch {
      return { version: '0.1.0', agents: [] };
    }
  }

  private async save(data: RegistryData): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
