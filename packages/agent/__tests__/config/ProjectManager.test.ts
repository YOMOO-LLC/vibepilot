import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectManager } from '../../src/config/ProjectManager.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import type { ProjectInfo } from '@vibepilot/protocol';

describe('ProjectManager', () => {
  let tmpDir: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    // Create a temp directory for each test to avoid cross-test pollution
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibepilot-test-'));
    manager = new ProjectManager(tmpDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a ProjectManager instance', () => {
    expect(manager).toBeInstanceOf(ProjectManager);
  });

  it('registerProject registers a new project and returns ProjectInfo', async () => {
    const project = await manager.registerProject('MyApp', '/home/user/myapp');

    expect(project).toBeDefined();
    expect(project.id).toBeTruthy();
    expect(typeof project.id).toBe('string');
    expect(project.name).toBe('MyApp');
    expect(project.path).toBe('/home/user/myapp');
  });

  it('registerProject assigns unique ids to different projects', async () => {
    const p1 = await manager.registerProject('App1', '/path/app1');
    const p2 = await manager.registerProject('App2', '/path/app2');

    expect(p1.id).not.toBe(p2.id);
  });

  it('listProjects returns all registered projects', async () => {
    expect(manager.listProjects()).toEqual([]);

    await manager.registerProject('App1', '/path/app1');
    await manager.registerProject('App2', '/path/app2');

    const projects = manager.listProjects();
    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p.name === 'App1')).toBeDefined();
    expect(projects.find((p) => p.name === 'App2')).toBeDefined();
  });

  it('switchProject switches to the given project and returns it', async () => {
    const registered = await manager.registerProject('MyApp', '/home/user/myapp');

    const switched = await manager.switchProject(registered.id);

    expect(switched).toEqual(registered);
  });

  it('getCurrentProject returns null when no project is active', () => {
    expect(manager.getCurrentProject()).toBeNull();
  });

  it('getCurrentProject returns the currently active project after switch', async () => {
    const p1 = await manager.registerProject('App1', '/path/app1');
    const p2 = await manager.registerProject('App2', '/path/app2');

    await manager.switchProject(p1.id);
    expect(manager.getCurrentProject()).toEqual(p1);

    await manager.switchProject(p2.id);
    expect(manager.getCurrentProject()).toEqual(p2);
  });

  it('switchProject throws for non-existent projectId', async () => {
    await expect(manager.switchProject('non-existent-id')).rejects.toThrow('Project not found');
  });

  it('removeProject removes a project', async () => {
    const project = await manager.registerProject('MyApp', '/path/myapp');

    expect(manager.listProjects()).toHaveLength(1);

    await manager.removeProject(project.id);

    expect(manager.listProjects()).toHaveLength(0);
  });

  it('removeProject throws for non-existent projectId', async () => {
    await expect(manager.removeProject('non-existent-id')).rejects.toThrow('Project not found');
  });

  it('removeProject clears currentProjectId if removing the active project', async () => {
    const project = await manager.registerProject('MyApp', '/path/myapp');
    await manager.switchProject(project.id);
    expect(manager.getCurrentProject()).toEqual(project);

    await manager.removeProject(project.id);
    expect(manager.getCurrentProject()).toBeNull();
  });

  describe('persistence (load/save)', () => {
    it('persists projects to disk and loads them back', async () => {
      await manager.registerProject('App1', '/path/app1');
      await manager.registerProject('App2', '/path/app2');

      // Create a new manager pointing at the same configDir
      const manager2 = new ProjectManager(tmpDir);
      await manager2.load();

      const projects = manager2.listProjects();
      expect(projects).toHaveLength(2);
      expect(projects.find((p) => p.name === 'App1')).toBeDefined();
      expect(projects.find((p) => p.name === 'App2')).toBeDefined();
    });

    it('persists the current project id across reloads', async () => {
      const project = await manager.registerProject('MyApp', '/path/myapp');
      await manager.switchProject(project.id);

      const manager2 = new ProjectManager(tmpDir);
      await manager2.load();

      expect(manager2.getCurrentProject()).toEqual(project);
    });

    it('load handles missing config file gracefully (fresh start)', async () => {
      const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibepilot-fresh-'));
      try {
        const freshManager = new ProjectManager(freshDir);
        await freshManager.load();

        expect(freshManager.listProjects()).toEqual([]);
        expect(freshManager.getCurrentProject()).toBeNull();
      } finally {
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });

    it('creates the config directory if it does not exist', async () => {
      const nestedDir = path.join(tmpDir, 'nested', 'config');
      const nestedManager = new ProjectManager(nestedDir);
      await nestedManager.registerProject('App1', '/path/app1');

      // Verify the config.json file was created
      const configPath = path.join(nestedDir, 'config.json');
      const stat = await fs.stat(configPath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('ConfigManager migration', () => {
    it('imports projects from old projects.json into config.json', async () => {
      // Create old-style projects.json with 1 project
      const oldProject: ProjectInfo = {
        id: 'old-proj-1',
        name: 'OldProject',
        path: '/home/user/old-project',
      };
      const oldConfig = {
        projects: [oldProject],
        currentProjectId: null,
      };
      await fs.writeFile(
        path.join(tmpDir, 'projects.json'),
        JSON.stringify(oldConfig, null, 2),
        'utf-8'
      );

      // Create ProjectManager with ConfigManager pointing to same tmpDir
      const configManager = new ConfigManager(tmpDir);
      const pm = new ProjectManager(tmpDir, configManager);
      await pm.load();

      // Verify project is accessible
      expect(pm.getProject('old-proj-1')).toBeDefined();
      expect(pm.getProject('old-proj-1')?.name).toBe('OldProject');
      expect(pm.listProjects()).toHaveLength(1);

      // Verify old projects.json is deleted
      await expect(fs.access(path.join(tmpDir, 'projects.json'))).rejects.toThrow();

      // Verify config.json now contains the project
      const config = await configManager.load();
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].name).toBe('OldProject');
    });

    it('works with empty config and no old file (fresh start)', async () => {
      const configManager = new ConfigManager(tmpDir);
      const pm = new ProjectManager(tmpDir, configManager);
      await pm.load();

      // Verify empty state
      expect(pm.listProjects()).toEqual([]);

      // Add a project, verify it persists to config.json
      await pm.registerProject('NewApp', '/path/new-app');
      expect(pm.listProjects()).toHaveLength(1);

      // Verify config.json contains the project
      const config = await configManager.load();
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].name).toBe('NewApp');
    });

    it('does not re-import old file when config already has projects', async () => {
      const configManager = new ConfigManager(tmpDir);

      // Save a project via ConfigManager first
      const config = configManager.getDefault();
      config.projects = [{ id: 'config-proj', name: 'ConfigProject', path: '/path/config-proj' }];
      await configManager.save(config);

      // Also create old projects.json with a DIFFERENT project
      const oldConfig = {
        projects: [{ id: 'old-proj', name: 'OldProject', path: '/path/old-proj' }],
        currentProjectId: null,
      };
      await fs.writeFile(
        path.join(tmpDir, 'projects.json'),
        JSON.stringify(oldConfig, null, 2),
        'utf-8'
      );

      // Load ProjectManager
      const pm = new ProjectManager(tmpDir, configManager);
      await pm.load();

      // Only the config project should exist (old file NOT re-imported)
      expect(pm.listProjects()).toHaveLength(1);
      expect(pm.getProject('config-proj')).toBeDefined();
      expect(pm.getProject('config-proj')?.name).toBe('ConfigProject');
      expect(pm.getProject('old-proj')).toBeNull();
    });
  });
});
