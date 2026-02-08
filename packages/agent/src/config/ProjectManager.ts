import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProjectInfo } from '@vibepilot/protocol';
import { ProjectValidator } from './ProjectValidator.js';

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
    // 设置文件权限为仅所有者读写
    await fs.chmod(this.configPath, 0o600);
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
   * 添加新项目（带路径验证和元数据）
   */
  async addProject(
    name: string,
    projectPath: string,
    metadata?: { favorite?: boolean; color?: string; tags?: string[] }
  ): Promise<ProjectInfo> {
    // 1. 验证路径
    const validation = await ProjectValidator.validate(projectPath);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid project path');
    }

    // 2. 检查路径是否已存在
    const existingProject = this.getProjectByPath(validation.resolvedPath!);
    if (existingProject) {
      throw new Error(`Project path already exists: ${existingProject.name}`);
    }

    // 3. 创建项目
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
   * 更新项目元数据
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
   * 更新项目的最后访问时间
   */
  async touchProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastAccessed = Date.now();
      await this.save();
    }
  }

  /**
   * 根据路径查找项目
   */
  getProjectByPath(projectPath: string): ProjectInfo | null {
    return Array.from(this.projects.values()).find((p) => p.path === projectPath) || null;
  }

  /**
   * 根据 ID 获取项目
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
    // 更新最后访问时间
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
