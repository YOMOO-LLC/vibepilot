import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProjectInfo } from '@vibepilot/protocol';
import { ProjectValidator } from './ProjectValidator.js';
import { ConfigManager } from './ConfigManager.js';

export class ProjectManager {
  private projects: Map<string, ProjectInfo> = new Map();
  private currentProjectId: string | null = null;
  private configDir: string;
  private configManager: ConfigManager;

  constructor(configDir?: string, configManager?: ConfigManager) {
    this.configDir = configDir || path.join(os.homedir(), '.vibepilot');
    this.configManager = configManager || new ConfigManager(this.configDir);
  }

  async load(): Promise<void> {
    const config = await this.configManager.load();

    // Migration: if config has no projects, check for old projects.json
    if (config.projects.length === 0) {
      const oldPath = path.join(this.configDir, 'projects.json');
      try {
        const oldData = await fs.readFile(oldPath, 'utf-8');
        const oldConfig = JSON.parse(oldData);
        if (
          oldConfig.projects &&
          Array.isArray(oldConfig.projects) &&
          oldConfig.projects.length > 0
        ) {
          config.projects = oldConfig.projects;
          if (oldConfig.currentProjectId) {
            config.currentProjectId = oldConfig.currentProjectId;
          }
          await this.configManager.save(config);
          await fs.unlink(oldPath); // Clean up old file
        }
      } catch {
        // Old file doesn't exist or is corrupted, skip migration
      }
    }

    // Populate in-memory Map from config.projects
    this.projects.clear();
    for (const p of config.projects) {
      this.projects.set(p.id, p);
    }
    this.currentProjectId = config.currentProjectId ?? null;
  }

  private async save(): Promise<void> {
    const config = await this.configManager.load();

    config.projects = Array.from(this.projects.values());
    config.currentProjectId = this.currentProjectId;

    await this.configManager.save(config);
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

  /**
   * Add a new project with path validation and metadata
   */
  async addProject(
    name: string,
    projectPath: string,
    metadata?: { favorite?: boolean; color?: string; tags?: string[] }
  ): Promise<ProjectInfo> {
    // 1. Validate path
    const validation = await ProjectValidator.validate(projectPath);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid project path');
    }

    // 2. Check if path already exists
    const existingProject = this.getProjectByPath(validation.resolvedPath!);
    if (existingProject) {
      throw new Error(`Project path already exists: ${existingProject.name}`);
    }

    // 3. Create project
    const project: ProjectInfo = {
      id: uuidv4(),
      name,
      path: validation.resolvedPath!,
      createdAt: Date.now(),
      ...metadata,
    };

    this.projects.set(project.id, project);
    await this.save();
    return project;
  }

  /**
   * Update project metadata
   */
  async updateProject(
    projectId: string,
    updates: Partial<Pick<ProjectInfo, 'name' | 'favorite' | 'color' | 'tags'>>
  ): Promise<ProjectInfo> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    Object.assign(project, updates);
    await this.save();
    return project;
  }

  /**
   * Update project last access time
   */
  async touchProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastAccessed = Date.now();
      await this.save();
    }
  }

  /**
   * Find project by path
   */
  getProjectByPath(projectPath: string): ProjectInfo | null {
    return Array.from(this.projects.values()).find((p) => p.path === projectPath) || null;
  }

  /**
   * Get project by ID
   */
  getProject(projectId: string): ProjectInfo | null {
    return this.projects.get(projectId) || null;
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
    // Update last access time
    project.lastAccessed = Date.now();
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
