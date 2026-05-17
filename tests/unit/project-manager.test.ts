import { ProjectManager } from '../../src/managers/project-manager';
import { MixIQDatabase, RecordNotFoundError, DatabaseError } from '../../src/db/database';
import { ValidationError } from '../../src/utils/validator';
import fs from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

// Mock os.homedir
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/test'),
}));

// Mock Logger
jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('ProjectManager', () => {
  let mockDb: jest.Mocked<MixIQDatabase>;
  let projectManager: ProjectManager;

  const mockProject = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'test-project',
    workspace_path: '/home/test/.mixiq/projects/test-project',
    git_remotes: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockEnvironments = [
    {
      id: 'env-1',
      project_id: mockProject.id,
      name: 'production',
      servers: [],
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const mockAgents = [
    {
      id: 'agent-1',
      project_id: mockProject.id,
      agent_type: 'deploy-agent',
      status: 'running' as const,
      allowed_tools: [],
      context: { conversationHistory: [], metadata: {} },
      created_at: new Date(),
      updated_at: new Date(),
    },
  ] as any[];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock database
    mockDb = {
      insert: jest.fn().mockReturnValue(mockProject),
      findById: jest.fn().mockReturnValue(mockProject),
      findAll: jest.fn().mockReturnValue([]),
      update: jest.fn().mockReturnValue({ ...mockProject, name: 'updated-project' }),
      delete: jest.fn().mockReturnValue(true),
      init: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<MixIQDatabase>;

    projectManager = new ProjectManager(mockDb);
  });

  describe('initProject', () => {
    it('should create a new project with workspace directory', async () => {
      // Setup
      const projectName = 'test-project';
      const expectedWorkspacePath = '/home/test/.mixiq/projects/test-project';
      mockDb.findAll.mockReturnValueOnce([]); // No existing projects
      mockDb.insert.mockReturnValueOnce({
        ...mockProject,
        name: projectName,
        workspace_path: expectedWorkspacePath,
      });

      // Execute
      const result = await projectManager.initProject(projectName);

      // Verify
      expect(result.project_id).toBe(mockProject.id);
      expect(result.workspace_path).toBe(expectedWorkspacePath);
      expect(fs.mkdir).toHaveBeenCalledWith(expectedWorkspacePath, { recursive: true });
      expect(mockDb.insert).toHaveBeenCalled();
      const insertArg = (mockDb.insert as jest.Mock).mock.calls[0][1];
      expect(insertArg.name).toBe(projectName);
      expect(insertArg.workspace_path).toBe(expectedWorkspacePath);
      expect(insertArg.git_remotes).toEqual([]);
    });

    it('should initialize project with git remote when gitUrl is provided', async () => {
      // Setup
      const projectName = 'test-project';
      const gitUrl = 'https://github.com/user/repo.git';
      mockDb.findAll.mockReturnValueOnce([]);

      // Execute
      await projectManager.initProject(projectName, undefined, gitUrl);

      // Verify
      const insertArg = (mockDb.insert as jest.Mock).mock.calls[0][1];
      expect(insertArg.git_remotes).toEqual([{ name: 'origin', url: gitUrl }]);
    });

    it('should throw ValidationError when project name already exists', async () => {
      // Setup
      const projectName = 'existing-project';
      mockDb.findAll.mockReturnValueOnce([mockProject]);

      // Execute & Verify
      await expect(projectManager.initProject(projectName)).rejects.toThrow(ValidationError);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when project name is invalid', async () => {
      // Execute & Verify
      await expect(projectManager.initProject('invalid name with spaces')).rejects.toThrow(ValidationError);
      await expect(projectManager.initProject('')).rejects.toThrow(ValidationError);
    });

    it('should throw DatabaseError when database insert fails', async () => {
      // Setup
      const projectName = 'test-project';
      mockDb.findAll.mockReturnValueOnce([]);
      mockDb.insert.mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      // Execute & Verify
      await expect(projectManager.initProject(projectName)).rejects.toThrow(Error);
    });
  });

  describe('switchProject', () => {
    it('should switch to the specified project and return project info', async () => {
      // Setup
      mockDb.findAll
        .mockReturnValueOnce(mockEnvironments) // environments
        .mockReturnValueOnce(mockAgents); // agents

      // Execute
      const result = await projectManager.switchProject(mockProject.id);

      // Verify
      expect(result.id).toBe(mockProject.id);
      expect(result.name).toBe(mockProject.name);
      expect(result.environments).toEqual(mockEnvironments);
      expect(result.active_agents).toEqual(mockAgents);
      expect((projectManager as any).currentProjectId).toBe(mockProject.id);
    });

    it('should throw RecordNotFoundError when project does not exist', async () => {
      // Setup
      mockDb.findById.mockReturnValueOnce(null);

      // Execute & Verify
      await expect(projectManager.switchProject('non-existent-id')).rejects.toThrow(RecordNotFoundError);
    });
  });

  describe('getProjectInfo', () => {
    it('should return project info with associated data when projectId is provided', async () => {
      // Setup
      mockDb.findAll
        .mockReturnValueOnce(mockEnvironments)
        .mockReturnValueOnce(mockAgents);

      // Execute
      const result = await projectManager.getProjectInfo(mockProject.id);

      // Verify
      expect(result.id).toBe(mockProject.id);
      expect(result.environments).toHaveLength(1);
      expect(result.active_agents).toHaveLength(1);
      expect(mockDb.findById).toHaveBeenCalledWith('projects', mockProject.id);
    });

    it('should use current project id when projectId is not provided', async () => {
      // Setup - first switch to set current project
      mockDb.findAll
        .mockReturnValueOnce(mockEnvironments) // for switchProject
        .mockReturnValueOnce(mockAgents)
        .mockReturnValueOnce(mockEnvironments) // for getProjectInfo
        .mockReturnValueOnce(mockAgents);

      await projectManager.switchProject(mockProject.id);

      // Execute
      const result = await projectManager.getProjectInfo();

      // Verify
      expect(result.id).toBe(mockProject.id);
    });

    it('should throw ValidationError when no projectId and no current project', async () => {
      // Execute & Verify
      await expect(projectManager.getProjectInfo()).rejects.toThrow(ValidationError);
    });

    it('should throw RecordNotFoundError when project does not exist', async () => {
      // Setup
      mockDb.findById.mockReturnValueOnce(null);

      // Execute & Verify
      await expect(projectManager.getProjectInfo('non-existent')).rejects.toThrow(RecordNotFoundError);
    });
  });

  describe('listProjects', () => {
    it('should return all projects from database', async () => {
      // Setup
      const projects = [mockProject, { ...mockProject, id: 'project-2', name: 'project-2' }];
      mockDb.findAll.mockReturnValueOnce(projects);

      // Execute
      const result = await projectManager.listProjects();

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test-project');
      expect(result[1].name).toBe('project-2');
      expect(mockDb.findAll).toHaveBeenCalledWith('projects');
    });

    it('should return empty array when no projects exist', async () => {
      // Setup
      mockDb.findAll.mockReturnValueOnce([]);

      // Execute
      const result = await projectManager.listProjects();

      // Verify
      expect(result).toEqual([]);
    });
  });

  describe('updateProject', () => {
    it('should update project name successfully', async () => {
      // Setup
      const updates = { name: 'updated-project-name' };
      mockDb.findAll.mockReturnValueOnce([]); // No conflicting names
      mockDb.update.mockReturnValueOnce({ ...mockProject, ...updates });

      // Execute
      const result = await projectManager.updateProject(mockProject.id, updates);

      // Verify
      expect(result.name).toBe('updated-project-name');
      expect(mockDb.update).toHaveBeenCalledWith('projects', mockProject.id, updates);
    });

    it('should update workspace path and create directory', async () => {
      // Setup
      const newWorkspacePath = '/new/workspace/path';
      const updates = { workspace_path: newWorkspacePath };

      // Execute
      await projectManager.updateProject(mockProject.id, updates);

      // Verify
      expect(fs.mkdir).toHaveBeenCalledWith(newWorkspacePath, { recursive: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ValidationError when new name already exists for another project', async () => {
      // Setup
      const updates = { name: 'existing-name' };
      mockDb.findAll.mockReturnValueOnce([{ ...mockProject, id: 'different-id', name: 'existing-name' }]);

      // Execute & Verify
      await expect(projectManager.updateProject(mockProject.id, updates)).rejects.toThrow(ValidationError);
    });

    it('should allow updating to the same name', async () => {
      // Setup
      const updates = { name: mockProject.name };
      mockDb.findAll.mockReturnValueOnce([mockProject]); // Same project
      mockDb.update.mockReturnValueOnce({ ...mockProject, ...updates });

      // Execute
      const result = await projectManager.updateProject(mockProject.id, updates);

      // Verify
      expect(result.name).toBe(mockProject.name);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully without deleting workspace', async () => {
      // Execute
      const result = await projectManager.deleteProject(mockProject.id);

      // Verify
      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalledWith('projects', mockProject.id);
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should delete project and workspace when deleteWorkspace is true', async () => {
      // Execute
      const result = await projectManager.deleteProject(mockProject.id, true);

      // Verify
      expect(result).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(mockProject.workspace_path, { recursive: true, force: true });
    });

    it('should clear current project id when deleting current project', async () => {
      // Setup - switch to project first
      mockDb.findAll
        .mockReturnValueOnce(mockEnvironments)
        .mockReturnValueOnce(mockAgents);
      await projectManager.switchProject(mockProject.id);

      // Execute
      await projectManager.deleteProject(mockProject.id);

      // Verify
      expect((projectManager as any).currentProjectId).toBeNull();
    });

    it('should throw RecordNotFoundError when project does not exist', async () => {
      // Setup
      mockDb.findById.mockReturnValueOnce(null);

      // Execute & Verify
      await expect(projectManager.deleteProject('non-existent')).rejects.toThrow(RecordNotFoundError);
    });

    it('should return false when database delete returns false', async () => {
      // Setup
      mockDb.delete.mockReturnValueOnce(false);

      // Execute & Verify
      await expect(projectManager.deleteProject(mockProject.id)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getCurrentProjectId', () => {
    it('should return null when no project is selected', () => {
      expect(projectManager.getCurrentProjectId()).toBeNull();
    });

    it('should return current project id after switching', async () => {
      // Setup
      mockDb.findAll
        .mockReturnValueOnce(mockEnvironments)
        .mockReturnValueOnce(mockAgents);

      await projectManager.switchProject(mockProject.id);

      // Verify
      expect(projectManager.getCurrentProjectId()).toBe(mockProject.id);
    });
  });
});
