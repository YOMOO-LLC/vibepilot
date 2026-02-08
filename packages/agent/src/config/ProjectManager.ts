import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProjectInfo } from '@vibepilot/protocol';

interface ProjectConfig {
  projects: ProjectInfo[];
  currentProjectId: string | null;
}

export class ProjectManager {
  private projects: Map<string, ProjectInfo> = new Map();
  private currentProjectId: string | null = null;
  private configPath: string;
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.vibepilot');
    this.configPath = path.join(this.configDir, 'projects.json');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const config: ProjectConfig = JSON.parse(data);

      this.projects.clear();
      for (const project of config.projects) {
        this.projects.set(project.id, project);
      }
      this.currentProjectId = config.currentProjectId;
    } catch (err: unknown) {
      // File doesn't exist or is unreadable -- start fresh
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.projects.clear();
        this.currentProjectId = null;
        return;
      }
      throw err;
    }
  }

  private async save(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });

    const config: ProjectConfig = {
      projects: Array.from(this.projects.values()),
      currentProjectId: this.currentProjectId,
    };

    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async registerProject(name: string, projectPath: string): Promise<ProjectInfo> {
    const project: ProjectInfo = {
      id: uuidv4(),
      name,
      path: projectPath,
    };

    this.projects.set(project.id, project);
    await this.save();
    return project;
  }

  async removeProject(projectId: string): Promise<void> {
    if (!this.projects.has(projectId)) {
      throw new Error('Project not found');
    }

    this.projects.delete(projectId);

    if (this.currentProjectId === projectId) {
      this.currentProjectId = null;
    }

    await this.save();
  }

  listProjects(): ProjectInfo[] {
    return Array.from(this.projects.values());
  }

  async switchProject(projectId: string): Promise<ProjectInfo> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    this.currentProjectId = projectId;
    await this.save();
    return project;
  }

  getCurrentProject(): ProjectInfo | null {
    if (!this.currentProjectId) {
      return null;
    }
    return this.projects.get(this.currentProjectId) || null;
  }
}
