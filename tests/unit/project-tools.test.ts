import {
  projectInitHandler,
  projectSwitchHandler,
  projectInfoHandler,
  projectInitSchema,
  projectSwitchSchema,
  projectInfoSchema,
} from '../../src/tools/project-tools';
import type { ProjectManager } from '../../src/managers/project-manager';

// Mock ProjectManager
const mockProjectManager = {
  initProject: jest.fn(),
  switchProject: jest.fn(),
  getProjectInfo: jest.fn(),
};

describe('Project Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema Validation', () => {
    describe('projectInitSchema', () => {
      it('should validate valid project initialization parameters', () => {
        const validInput = {
          name: 'my-project-123',
        };
        const result = projectInitSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept optional template and git_url parameters', () => {
        const validInput = {
          name: 'my-project',
          template: 'node-express',
          git_url: 'https://github.com/user/repo.git',
        };
        const result = projectInitSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject empty project name', () => {
        const invalidInput = { name: '' };
        const result = projectInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject project names with spaces', () => {
        const invalidInput = { name: 'my project' };
        const result = projectInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject project names with special characters', () => {
        const invalidInput = { name: 'my@project!' };
        const result = projectInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject project names starting with invalid characters', () => {
        const invalidInput = { name: '-invalid' };
        const result = projectInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid git_url format', () => {
        const invalidInput = { name: 'my-project', git_url: 'not-a-url' };
        const result = projectInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('projectSwitchSchema', () => {
      it('should validate valid UUID project ID', () => {
        const validInput = { project_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = projectSwitchSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing project_id', () => {
        const invalidInput = {};
        const result = projectSwitchSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid UUID format', () => {
        const invalidInput = { project_id: 'not-a-uuid' };
        const result = projectSwitchSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty project_id', () => {
        const invalidInput = { project_id: '' };
        const result = projectSwitchSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('projectInfoSchema', () => {
      it('should validate empty object', () => {
        const result = projectInfoSchema.safeParse({});
        expect(result.success).toBe(true);
      });
    });
  });

  describe('projectInitHandler', () => {
    it('should return success with project data when initialization succeeds', async () => {
      // Setup
      const mockResult = {
        project_id: '123e4567-e89b-12d3-a456-426614174000',
        workspace_path: '/home/test/.mixiq/projects/my-project',
      };
      mockProjectManager.initProject.mockResolvedValue(mockResult);

      // Execute
      const result = await projectInitHandler(
        mockProjectManager as unknown as ProjectManager,
        { name: 'my-project' }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.project_id).toBe(mockResult.project_id);
        expect(result.data.workspace_path).toBe(mockResult.workspace_path);
      }
      expect(mockProjectManager.initProject).toHaveBeenCalledWith('my-project', undefined, undefined);
    });

    it('should pass template and git_url to initProject when provided', async () => {
      // Setup
      mockProjectManager.initProject.mockResolvedValue({
        project_id: 'test-id',
        workspace_path: '/path',
      });

      // Execute
      await projectInitHandler(
        mockProjectManager as unknown as ProjectManager,
        {
          name: 'my-project',
          template: 'react',
          git_url: 'https://github.com/user/repo.git',
        }
      );

      // Verify
      expect(mockProjectManager.initProject).toHaveBeenCalledWith(
        'my-project',
        'react',
        'https://github.com/user/repo.git'
      );
    });

    it('should return error when validation fails', async () => {
      // Execute
      const result = await projectInitHandler(
        mockProjectManager as unknown as ProjectManager,
        { name: '' } // Invalid: empty name
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('project_init');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockProjectManager.initProject).not.toHaveBeenCalled();
    });

    it('should return error when initProject throws an error', async () => {
      // Setup
      const errorMessage = 'Project name already exists';
      mockProjectManager.initProject.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await projectInitHandler(
        mockProjectManager as unknown as ProjectManager,
        { name: 'existing-project' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should handle non-Error throw values gracefully', async () => {
        // Setup
        mockProjectManager.initProject.mockRejectedValue('String error');

        // Execute
        const result = await projectInitHandler(
          mockProjectManager as unknown as ProjectManager,
          { name: 'test-project' }
        );

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('String error');
        }
      });
    });

  describe('projectSwitchHandler', () => {
    it('should return success with project data when switch succeeds', async () => {
      // Setup
      const projectId = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = {
        project_id: projectId,
        name: 'test-project',
        current_branch: 'main',
        environments: [
          { id: 'env-1', name: 'production', servers: [] },
        ],
      };
      mockProjectManager.switchProject.mockResolvedValue(mockResult);

      // Execute
      const result = await projectSwitchHandler(
        mockProjectManager as unknown as ProjectManager,
        { project_id: projectId }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.project_id).toBe(projectId);
        expect(result.data.name).toBe('test-project');
        expect(result.data.environments).toHaveLength(1);
      }
      expect(mockProjectManager.switchProject).toHaveBeenCalledWith(projectId);
    });

    it('should return error when validation fails (invalid UUID)', async () => {
      // Execute
      const result = await projectSwitchHandler(
        mockProjectManager as unknown as ProjectManager,
        { project_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('project_switch');
      }
      expect(mockProjectManager.switchProject).not.toHaveBeenCalled();
    });

    it('should return error when switchProject throws RecordNotFoundError', async () => {
      // Setup
      const errorMessage = 'Project not found';
      mockProjectManager.switchProject.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await projectSwitchHandler(
        mockProjectManager as unknown as ProjectManager,
        { project_id: '123e4567-e89b-12d3-a456-426614174000' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('projectInfoHandler', () => {
    it('should return success with project info when retrieval succeeds', async () => {
      // Setup
      const mockResult = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-project',
        workspace_path: '/path/to/project',
        git_remotes: [],
        created_at: new Date(),
        updated_at: new Date(),
        environments: [
          { id: 'env-1', name: 'production', servers: [] },
        ],
        active_agents: 1,
      };
      mockProjectManager.getProjectInfo.mockResolvedValue(mockResult);

      // Execute
      const result = await projectInfoHandler(
        mockProjectManager as unknown as ProjectManager,
        {}
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('test-project');
        expect(result.data.environments).toHaveLength(1);
        expect(result.data.active_agents).toBe(1);
      }
      expect(mockProjectManager.getProjectInfo).toHaveBeenCalled();
    });

    it('should return error when no project is selected', async () => {
      // Setup
      const errorMessage = 'No project selected';
      mockProjectManager.getProjectInfo.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await projectInfoHandler(
        mockProjectManager as unknown as ProjectManager,
        {}
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should validate input parameters', async () => {
      // Setup
      mockProjectManager.getProjectInfo.mockResolvedValue({
        id: 'test-id',
        name: 'test',
        environments: [],
        active_agents: 0,
      });

      // Execute with extra parameters - should still work (extra params are ignored by zod)
      const result = await projectInfoHandler(
        mockProjectManager as unknown as ProjectManager,
        { extra_param: 'value' }
      );

      // Verify
      expect(result.success).toBe(true);
    });
  });
});
