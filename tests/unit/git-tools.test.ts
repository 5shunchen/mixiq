import {
  gitInitHandler,
  gitCloneHandler,
  gitStatusHandler,
  gitBranchCreateHandler,
  gitBranchListHandler,
  gitCheckoutHandler,
  gitCommitAndPushHandler,
  gitCreatePrHandler,
  gitReviewPrHandler,
  gitInitSchema,
  gitCloneSchema,
  gitStatusSchema,
  gitBranchCreateSchema,
  gitBranchListSchema,
  gitCheckoutSchema,
  gitCommitAndPushSchema,
  gitCreatePrSchema,
  gitReviewPrSchema,
} from '../../src/tools/git-tools';
import type { GitManager } from '../../src/managers/git-manager';

// Mock GitManager with the method signatures used in handlers
const mockGitManager = {
  initRepository: jest.fn(),
  cloneRepository: jest.fn(),
  getStatus: jest.fn(),
  createBranch: jest.fn(),
  listBranches: jest.fn(),
  checkoutBranch: jest.fn(),
  commitAndPush: jest.fn(),
  createPullRequest: jest.fn(),
  reviewPullRequest: jest.fn(),
};

describe('Git Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Schema Validation Tests ====================

  describe('Schema Validation', () => {
    describe('gitInitSchema', () => {
      it('should validate valid workspace path without git_url', () => {
        const validInput = {
          workspace_path: '/home/user/projects/my-project',
        };
        const result = gitInitSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate valid workspace path with git_url', () => {
        const validInput = {
          workspace_path: '/home/user/projects/my-project',
          git_url: 'https://github.com/user/repo.git',
        };
        const result = gitInitSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing workspace_path', () => {
        const invalidInput = { git_url: 'https://github.com/user/repo.git' };
        const result = gitInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid git_url format', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/my-project',
          git_url: 'not-a-valid-url',
        };
        const result = gitInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty workspace_path', () => {
        const invalidInput = { workspace_path: '' };
        const result = gitInitSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitCloneSchema', () => {
      it('should validate valid git_url and target_path', () => {
        const validInput = {
          git_url: 'https://github.com/user/repo.git',
          target_path: '/home/user/projects/repo',
        };
        const result = gitCloneSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing git_url', () => {
        const invalidInput = { target_path: '/home/user/projects/repo' };
        const result = gitCloneSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing target_path', () => {
        const invalidInput = { git_url: 'https://github.com/user/repo.git' };
        const result = gitCloneSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid git_url format', () => {
        const invalidInput = {
          git_url: 'invalid-url',
          target_path: '/home/user/projects/repo',
        };
        const result = gitCloneSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitStatusSchema', () => {
      it('should validate valid workspace_path', () => {
        const validInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitStatusSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing workspace_path', () => {
        const invalidInput = {};
        const result = gitStatusSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitBranchCreateSchema', () => {
      it('should validate valid branch name without from_branch', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: 'feature/new-feature',
        };
        const result = gitBranchCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate valid branch name with from_branch', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: 'feature/new-feature',
          from_branch: 'develop',
        };
        const result = gitBranchCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing branch_name', () => {
        const invalidInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitBranchCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty branch_name', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: '',
        };
        const result = gitBranchCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject branch names with invalid characters', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: 'invalid branch name',
        };
        const result = gitBranchCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject branch names starting with invalid characters', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: '-invalid-branch',
        };
        const result = gitBranchCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitBranchListSchema', () => {
      it('should validate valid workspace_path', () => {
        const validInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitBranchListSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing workspace_path', () => {
        const invalidInput = {};
        const result = gitBranchListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitCheckoutSchema', () => {
      it('should validate valid branch name', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: 'main',
        };
        const result = gitCheckoutSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing branch_name', () => {
        const invalidInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitCheckoutSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty branch_name', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          branch_name: '',
        };
        const result = gitCheckoutSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitCommitAndPushSchema', () => {
      it('should validate required message and workspace_path', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          message: 'feat: add new feature',
        };
        const result = gitCommitAndPushSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate with optional files array', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          message: 'fix: bug fix',
          files: ['src/file1.ts', 'src/file2.ts'],
        };
        const result = gitCommitAndPushSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate with optional remote and branch', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          message: 'docs: update readme',
          remote: 'origin',
          branch: 'main',
        };
        const result = gitCommitAndPushSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing message', () => {
        const invalidInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitCommitAndPushSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty message', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          message: '',
        };
        const result = gitCommitAndPushSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject files with directory traversal', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          message: 'test',
          files: ['../../../etc/passwd'],
        };
        const result = gitCommitAndPushSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitCreatePrSchema', () => {
      it('should validate all required parameters', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          title: 'New Feature PR',
          body: 'This PR adds a new feature',
          base_branch: 'main',
          head_branch: 'feature/new-feature',
        };
        const result = gitCreatePrSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate without optional body', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          title: 'New Feature PR',
          base_branch: 'main',
          head_branch: 'feature/new-feature',
        };
        const result = gitCreatePrSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing title', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          base_branch: 'main',
          head_branch: 'feature/new-feature',
        };
        const result = gitCreatePrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing base_branch', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          title: 'PR Title',
          head_branch: 'feature/new-feature',
        };
        const result = gitCreatePrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing head_branch', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          title: 'PR Title',
          base_branch: 'main',
        };
        const result = gitCreatePrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty title', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          title: '',
          base_branch: 'main',
          head_branch: 'feature/new-feature',
        };
        const result = gitCreatePrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('gitReviewPrSchema', () => {
      it('should validate valid pr_id', () => {
        const validInput = {
          workspace_path: '/home/user/projects/repo',
          pr_id: '123',
        };
        const result = gitReviewPrSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing pr_id', () => {
        const invalidInput = { workspace_path: '/home/user/projects/repo' };
        const result = gitReviewPrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty pr_id', () => {
        const invalidInput = {
          workspace_path: '/home/user/projects/repo',
          pr_id: '',
        };
        const result = gitReviewPrSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });
  });

  // ==================== Handler Tests ====================

  describe('gitInitHandler', () => {
    it('should return success with initialized data when repository initialization succeeds', async () => {
      const mockResult = { initialized: true, remote_configured: true };
      mockGitManager.initRepository.mockResolvedValue(mockResult);

      const result = await gitInitHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        git_url: 'https://github.com/user/repo.git',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initialized).toBe(true);
        expect(result.data.remote_configured).toBe(true);
      }
      expect(mockGitManager.initRepository).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'https://github.com/user/repo.git'
      );
    });

    it('should call initRepository without git_url when not provided', async () => {
      mockGitManager.initRepository.mockResolvedValue({
        initialized: true,
        remote_configured: false,
      });

      await gitInitHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(mockGitManager.initRepository).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        undefined
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitInitHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_init');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockGitManager.initRepository).not.toHaveBeenCalled();
    });

    it('should return error when initRepository throws an error', async () => {
      const errorMessage = 'Failed to initialize repository: permission denied';
      mockGitManager.initRepository.mockRejectedValue(new Error(errorMessage));

      const result = await gitInitHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should handle non-Error throw values gracefully', async () => {
      mockGitManager.initRepository.mockRejectedValue('String error message');

      const result = await gitInitHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('String error message');
      }
    });
  });

  describe('gitCloneHandler', () => {
    it('should return success with clone data when cloning succeeds', async () => {
      const mockResult = { cloned: true, path: '/home/user/projects/repo' };
      mockGitManager.cloneRepository.mockResolvedValue(mockResult);

      const result = await gitCloneHandler(mockGitManager as unknown as GitManager, {
        git_url: 'https://github.com/user/repo.git',
        target_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cloned).toBe(true);
        expect(result.data.path).toBe('/home/user/projects/repo');
      }
      expect(mockGitManager.cloneRepository).toHaveBeenCalledWith(
        'https://github.com/user/repo.git',
        '/home/user/projects/repo'
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitCloneHandler(mockGitManager as unknown as GitManager, {
        git_url: 'invalid-url',
        target_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_clone');
      }
      expect(mockGitManager.cloneRepository).not.toHaveBeenCalled();
    });

    it('should return error when cloneRepository throws an error', async () => {
      const errorMessage = 'Repository not found';
      mockGitManager.cloneRepository.mockRejectedValue(new Error(errorMessage));

      const result = await gitCloneHandler(mockGitManager as unknown as GitManager, {
        git_url: 'https://github.com/user/repo.git',
        target_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitStatusHandler', () => {
    it('should return success with status data when retrieval succeeds', async () => {
      const mockResult = {
        branch: 'main',
        staged: ['file1.ts'],
        modified: ['file2.ts'],
        untracked: ['file3.ts'],
      };
      mockGitManager.getStatus.mockResolvedValue(mockResult);

      const result = await gitStatusHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branch).toBe('main');
        expect(result.data.staged).toEqual(['file1.ts']);
        expect(result.data.modified).toEqual(['file2.ts']);
        expect(result.data.untracked).toEqual(['file3.ts']);
      }
      expect(mockGitManager.getStatus).toHaveBeenCalledWith('/home/user/projects/repo');
    });

    it('should return error when validation fails', async () => {
      const result = await gitStatusHandler(mockGitManager as unknown as GitManager, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_status');
      }
      expect(mockGitManager.getStatus).not.toHaveBeenCalled();
    });

    it('should return error when getStatus throws an error', async () => {
      const errorMessage = 'Not a git repository';
      mockGitManager.getStatus.mockRejectedValue(new Error(errorMessage));

      const result = await gitStatusHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitBranchCreateHandler', () => {
    it('should return success when creating branch without from_branch', async () => {
      const mockResult = { branch_name: 'feature/test', created: true };
      mockGitManager.createBranch.mockResolvedValue(mockResult);

      const result = await gitBranchCreateHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: 'feature/test',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branch_name).toBe('feature/test');
        expect(result.data.created).toBe(true);
      }
      expect(mockGitManager.createBranch).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'feature/test',
        undefined
      );
    });

    it('should return success when creating branch with from_branch', async () => {
      const mockResult = { branch_name: 'feature/test', created: true };
      mockGitManager.createBranch.mockResolvedValue(mockResult);

      const result = await gitBranchCreateHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: 'feature/test',
        from_branch: 'develop',
      });

      expect(result.success).toBe(true);
      expect(mockGitManager.createBranch).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'feature/test',
        'develop'
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitBranchCreateHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_branch_create');
      }
      expect(mockGitManager.createBranch).not.toHaveBeenCalled();
    });

    it('should return error when createBranch throws an error', async () => {
      const errorMessage = 'Branch already exists';
      mockGitManager.createBranch.mockRejectedValue(new Error(errorMessage));

      const result = await gitBranchCreateHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: 'existing-branch',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitBranchListHandler', () => {
    it('should return success with branches list', async () => {
      const mockResult = {
        branches: ['main', 'develop', 'feature/test'],
        current: 'main',
      };
      mockGitManager.listBranches.mockResolvedValue(mockResult);

      const result = await gitBranchListHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branches).toEqual(['main', 'develop', 'feature/test']);
        expect(result.data.current).toBe('main');
      }
      expect(mockGitManager.listBranches).toHaveBeenCalledWith('/home/user/projects/repo');
    });

    it('should return error when validation fails', async () => {
      const result = await gitBranchListHandler(mockGitManager as unknown as GitManager, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_branch_list');
      }
      expect(mockGitManager.listBranches).not.toHaveBeenCalled();
    });

    it('should return error when listBranches throws an error', async () => {
      const errorMessage = 'Git command failed';
      mockGitManager.listBranches.mockRejectedValue(new Error(errorMessage));

      const result = await gitBranchListHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitCheckoutHandler', () => {
    it('should return success when switching branches', async () => {
      const mockResult = { branch_name: 'develop', switched: true };
      mockGitManager.checkoutBranch.mockResolvedValue(mockResult);

      const result = await gitCheckoutHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: 'develop',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.branch_name).toBe('develop');
        expect(result.data.switched).toBe(true);
      }
      expect(mockGitManager.checkoutBranch).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'develop'
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitCheckoutHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_checkout');
      }
      expect(mockGitManager.checkoutBranch).not.toHaveBeenCalled();
    });

    it('should return error when checkoutBranch throws an error', async () => {
      const errorMessage = 'Branch does not exist';
      mockGitManager.checkoutBranch.mockRejectedValue(new Error(errorMessage));

      const result = await gitCheckoutHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        branch_name: 'nonexistent',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitCommitAndPushHandler', () => {
    it('should return success with commit hash when commit and push succeed', async () => {
      const mockResult = { commit_hash: 'abc123def456', pushed: true };
      mockGitManager.commitAndPush.mockResolvedValue(mockResult);

      const result = await gitCommitAndPushHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        message: 'feat: add new feature',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commit_hash).toBe('abc123def456');
        expect(result.data.pushed).toBe(true);
      }
      expect(mockGitManager.commitAndPush).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'feat: add new feature',
        undefined,
        'origin',
        undefined
      );
    });

    it('should pass files, remote, and branch parameters when provided', async () => {
      mockGitManager.commitAndPush.mockResolvedValue({
        commit_hash: 'abc123',
        pushed: true,
      });

      await gitCommitAndPushHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        message: 'fix: bug fix',
        files: ['src/file1.ts', 'src/file2.ts'],
        remote: 'upstream',
        branch: 'develop',
      });

      expect(mockGitManager.commitAndPush).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'fix: bug fix',
        ['src/file1.ts', 'src/file2.ts'],
        'upstream',
        'develop'
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitCommitAndPushHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        message: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_commit_and_push');
      }
      expect(mockGitManager.commitAndPush).not.toHaveBeenCalled();
    });

    it('should return error when commitAndPush throws an error during commit', async () => {
      const errorMessage = 'Nothing to commit';
      mockGitManager.commitAndPush.mockRejectedValue(new Error(errorMessage));

      const result = await gitCommitAndPushHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        message: 'test commit',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should handle commit failure with working tree clean scenario', async () => {
      const errorMessage = 'working tree clean, nothing to commit';
      mockGitManager.commitAndPush.mockRejectedValue(new Error(errorMessage));

      const result = await gitCommitAndPushHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        message: 'test commit',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('working tree clean');
      }
    });
  });

  describe('gitCreatePrHandler', () => {
    it('should return success with PR URL and ID when PR creation succeeds', async () => {
      const mockResult = {
        pr_url: 'https://github.com/user/repo/pull/123',
        pr_id: '123',
      };
      mockGitManager.createPullRequest.mockResolvedValue(mockResult);

      const result = await gitCreatePrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        title: 'New Feature',
        body: 'This PR adds a new feature',
        base_branch: 'main',
        head_branch: 'feature/new-feature',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pr_url).toBe('https://github.com/user/repo/pull/123');
        expect(result.data.pr_id).toBe('123');
      }
      expect(mockGitManager.createPullRequest).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'New Feature',
        'This PR adds a new feature',
        'main',
        'feature/new-feature'
      );
    });

    it('should call createPullRequest with undefined body when not provided', async () => {
      mockGitManager.createPullRequest.mockResolvedValue({
        pr_url: 'https://github.com/user/repo/pull/123',
        pr_id: '123',
      });

      await gitCreatePrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        title: 'New Feature',
        base_branch: 'main',
        head_branch: 'feature/new-feature',
      });

      expect(mockGitManager.createPullRequest).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        'New Feature',
        undefined,
        'main',
        'feature/new-feature'
      );
    });

    it('should return error when validation fails', async () => {
      const result = await gitCreatePrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        title: '',
        base_branch: 'main',
        head_branch: 'feature/test',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_create_pr');
      }
      expect(mockGitManager.createPullRequest).not.toHaveBeenCalled();
    });

    it('should return error when createPullRequest throws an error', async () => {
      const errorMessage = 'GitHub API rate limit exceeded';
      mockGitManager.createPullRequest.mockRejectedValue(new Error(errorMessage));

      const result = await gitCreatePrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        title: 'PR Title',
        base_branch: 'main',
        head_branch: 'feature/test',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  describe('gitReviewPrHandler', () => {
    it('should return success with review data when PR review succeeds', async () => {
      const mockResult = {
        approved: true,
        comments: ['Looks good!', 'Minor change requested'],
      };
      mockGitManager.reviewPullRequest.mockResolvedValue(mockResult);

      const result = await gitReviewPrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        pr_id: '123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.approved).toBe(true);
        expect(result.data.comments).toEqual(['Looks good!', 'Minor change requested']);
      }
      expect(mockGitManager.reviewPullRequest).toHaveBeenCalledWith(
        '/home/user/projects/repo',
        '123'
      );
    });

    it('should return success when PR is not approved', async () => {
      const mockResult = {
        approved: false,
        comments: ['Needs more work'],
      };
      mockGitManager.reviewPullRequest.mockResolvedValue(mockResult);

      const result = await gitReviewPrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        pr_id: '456',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.approved).toBe(false);
      }
    });

    it('should return error when validation fails', async () => {
      const result = await gitReviewPrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        pr_id: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('git_review_pr');
      }
      expect(mockGitManager.reviewPullRequest).not.toHaveBeenCalled();
    });

    it('should return error when reviewPullRequest throws an error', async () => {
      const errorMessage = 'PR not found';
      mockGitManager.reviewPullRequest.mockRejectedValue(new Error(errorMessage));

      const result = await gitReviewPrHandler(mockGitManager as unknown as GitManager, {
        workspace_path: '/home/user/projects/repo',
        pr_id: '999',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });
});
