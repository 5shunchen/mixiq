import { GitManager, defaultGitManager } from '../../src/managers/git-manager';
import { GitOperationError, GitRepoNotFoundError } from '../../src/types';
import simpleGit from 'simple-git';
import * as path from 'path';
import * as os from 'os';

// Mock execAsync function
const mockExecAsync = jest.fn();

// Mock simple-git
jest.mock('simple-git', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock child_process and util.promisify
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: jest.fn().mockReturnValue(() => mockExecAsync()),
}));

// Mock validator and security utils
jest.mock('../../src/utils/validator', () => ({
  validatePath: jest.fn(),
}));

jest.mock('../../src/utils/security', () => ({
  SecurityUtils: {
    validatePath: jest.fn(),
    validateCommand: jest.fn(),
  },
}));

// Mock Logger
jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>;

describe('GitManager - Git 管理器测试', () => {
  let gitManager: GitManager;
  let mockGitInstance: any;
  let testWorkspacePath: string;

  // 创建 mock git 实例的辅助函数
  const createMockGitInstance = () => ({
    checkIsRepo: jest.fn(),
    init: jest.fn(),
    remote: jest.fn(),
    addRemote: jest.fn(),
    status: jest.fn(),
    branch: jest.fn(),
    revparse: jest.fn(),
    checkoutBranch: jest.fn(),
    checkoutLocalBranch: jest.fn(),
    checkout: jest.fn(),
    deleteLocalBranch: jest.fn(),
    add: jest.fn(),
    commit: jest.fn(),
    push: jest.fn(),
    pull: jest.fn(),
    log: jest.fn(),
    getRemotes: jest.fn(),
    clone: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 mock git 实例
    mockGitInstance = createMockGitInstance();
    mockSimpleGit.mockReturnValue(mockGitInstance);

    // 创建 GitManager 实例
    gitManager = new GitManager();

    // 测试工作区路径
    testWorkspacePath = path.join(os.tmpdir(), 'mixiq-test-repo');
  });

  describe('实例化测试', () => {
    it('应该正确创建 GitManager 实例', () => {
      expect(gitManager).toBeInstanceOf(GitManager);
    });

    it('应该存在默认的全局 GitManager 实例', () => {
      expect(defaultGitManager).toBeInstanceOf(GitManager);
    });
  });

  describe('initRepo - 初始化仓库测试', () => {
    it('应该成功初始化新的 Git 仓库', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(false);
      mockGitInstance.init.mockResolvedValue(undefined);

      const result = await gitManager.initRepo(testWorkspacePath);

      expect(result).toBe(true);
      expect(mockSimpleGit).toHaveBeenCalledWith(testWorkspacePath);
      expect(mockGitInstance.checkIsRepo).toHaveBeenCalled();
      expect(mockGitInstance.init).toHaveBeenCalled();
    });

    it('当工作区已经是 Git 仓库时应该返回 true', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);

      const result = await gitManager.initRepo(testWorkspacePath);

      expect(result).toBe(true);
      expect(mockGitInstance.init).not.toHaveBeenCalled();
    });

    it('应该在初始化时添加远程仓库地址', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      mockGitInstance.checkIsRepo.mockResolvedValue(false);
      mockGitInstance.init.mockResolvedValue(undefined);
      mockGitInstance.addRemote.mockResolvedValue(undefined);

      const result = await gitManager.initRepo(testWorkspacePath, gitUrl);

      expect(result).toBe(true);
      expect(mockGitInstance.addRemote).toHaveBeenCalledWith('origin', gitUrl);
    });

    it('当仓库已存在时应该更新远程仓库地址', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.remote.mockResolvedValue(undefined);

      const result = await gitManager.initRepo(testWorkspacePath, gitUrl);

      expect(result).toBe(true);
      expect(mockGitInstance.remote).toHaveBeenCalledWith([
        'set-url',
        'origin',
        gitUrl,
      ]);
    });

    it('当 set-url 失败时应该尝试添加新的远程仓库', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.remote.mockRejectedValueOnce(new Error('remote not found'));
      mockGitInstance.addRemote.mockResolvedValue(undefined);

      const result = await gitManager.initRepo(testWorkspacePath, gitUrl);

      expect(result).toBe(true);
      expect(mockGitInstance.addRemote).toHaveBeenCalledWith('origin', gitUrl);
    });

    it('初始化失败时应该抛出 GitOperationError', async () => {
      const errorMessage = '初始化失败';
      mockGitInstance.checkIsRepo.mockRejectedValue(new Error(errorMessage));

      await expect(gitManager.initRepo(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
      await expect(gitManager.initRepo(testWorkspacePath)).rejects.toThrow(
        `Git 仓库初始化失败: ${errorMessage}`
      );
    });
  });

  describe('getStatus - 获取状态测试', () => {
    it('应该成功获取仓库状态信息', async () => {
      const mockStatus = {
        staged: ['file1.ts'],
        modified: ['file2.ts'],
        deleted: [],
        not_added: ['file3.ts'],
        conflicted: [],
        renamed: [{ from: 'old.ts', to: 'new.ts' }],
        current: 'main',
        tracking: 'origin/main',
        ahead: 1,
        behind: 0,
      };

      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.status.mockResolvedValue(mockStatus);

      const result = await gitManager.getStatus(testWorkspacePath);

      expect(result.isRepo).toBe(true);
      expect(result.staged).toEqual(['file1.ts']);
      expect(result.modified).toEqual(['file2.ts']);
      expect(result.untracked).toEqual(['file3.ts']);
      expect(result.renamed).toEqual(['new.ts']);
      expect(result.currentBranch).toBe('main');
      expect(result.ahead).toBe(1);
      expect(result.behind).toBe(0);
    });

    it('当路径不是 Git 仓库时应该返回 isRepo=false', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(false);

      const result = await gitManager.getStatus(testWorkspacePath);

      expect(result.isRepo).toBe(false);
      expect(result.staged).toEqual([]);
      expect(result.modified).toEqual([]);
    });

    it('获取状态失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.status.mockRejectedValue(new Error('状态获取失败'));

      await expect(gitManager.getStatus(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('createBranch - 创建分支测试', () => {
    it('应该成功创建新分支', async () => {
      const branchName = 'feature/test';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.checkoutLocalBranch.mockResolvedValue(undefined);

      const result = await gitManager.createBranch(testWorkspacePath, branchName);

      expect(result).toBe(true);
      expect(mockGitInstance.checkoutLocalBranch).toHaveBeenCalledWith(branchName);
    });

    it('应该基于指定分支创建新分支', async () => {
      const branchName = 'feature/test';
      const fromBranch = 'develop';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.checkoutBranch.mockResolvedValue(undefined);

      const result = await gitManager.createBranch(
        testWorkspacePath,
        branchName,
        fromBranch
      );

      expect(result).toBe(true);
      expect(mockGitInstance.checkoutBranch).toHaveBeenCalledWith(
        branchName,
        fromBranch
      );
    });

    it('创建分支失败时应该抛出 GitOperationError', async () => {
      const branchName = 'feature/test';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.checkoutLocalBranch.mockRejectedValue(
        new Error('分支已存在')
      );

      await expect(
        gitManager.createBranch(testWorkspacePath, branchName)
      ).rejects.toThrow(GitOperationError);
    });

    it('当不是 Git 仓库时应该抛出 GitOperationError', async () => {
      const branchName = 'feature/test';
      mockGitInstance.checkIsRepo.mockResolvedValue(false);

      await expect(
        gitManager.createBranch(testWorkspacePath, branchName)
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('checkoutBranch - 切换分支测试', () => {
    it('应该成功切换到指定分支', async () => {
      const branchName = 'develop';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.checkout.mockResolvedValue(undefined);

      const result = await gitManager.checkoutBranch(testWorkspacePath, branchName);

      expect(result).toBe(true);
      expect(mockGitInstance.checkout).toHaveBeenCalledWith(branchName);
    });

    it('切换分支失败时应该抛出 GitOperationError', async () => {
      const branchName = 'nonexistent';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.checkout.mockRejectedValue(new Error('分支不存在'));

      await expect(
        gitManager.checkoutBranch(testWorkspacePath, branchName)
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('getBranches - 获取分支列表测试', () => {
    it('应该成功获取分支列表', async () => {
      const mockBranches = {
        all: ['main', 'develop', 'feature/test'],
        branches: {
          main: { commit: 'abc123', label: 'main' },
          develop: { commit: 'def456', label: 'develop' },
          'feature/test': { commit: 'ghi789', label: 'feature/test' },
        },
        current: 'main',
        detached: false,
      };

      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.branch.mockResolvedValue(mockBranches);

      const result = await gitManager.getBranches(testWorkspacePath);

      expect(result.all).toEqual(['main', 'develop', 'feature/test']);
      expect(result.current).toBe('main');
      expect(result.detached).toBe(false);
      expect(result.branches).toHaveLength(3);
      expect(result.branches[0].name).toBe('main');
      expect(result.branches[0].current).toBe(true);
    });

    it('获取分支列表失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.branch.mockRejectedValue(new Error('获取失败'));

      await expect(gitManager.getBranches(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('getCurrentBranch - 获取当前分支测试', () => {
    it('应该成功获取当前分支名称', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');

      const result = await gitManager.getCurrentBranch(testWorkspacePath);

      expect(result).toBe('main');
      expect(mockGitInstance.revparse).toHaveBeenCalledWith([
        '--abbrev-ref',
        'HEAD',
      ]);
    });

    it('获取当前分支失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockRejectedValue(new Error('获取失败'));

      await expect(gitManager.getCurrentBranch(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('addFiles - 添加文件到暂存区测试', () => {
    it('应该成功添加所有文件到暂存区', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.add.mockResolvedValue(undefined);

      const result = await gitManager.addFiles(testWorkspacePath);

      expect(result).toBe(true);
      expect(mockGitInstance.add).toHaveBeenCalledWith('.');
    });

    it('应该成功添加指定文件到暂存区', async () => {
      const files = ['file1.ts', 'file2.ts'];
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.add.mockResolvedValue(undefined);

      const result = await gitManager.addFiles(testWorkspacePath, files);

      expect(result).toBe(true);
      expect(mockGitInstance.add).toHaveBeenCalledWith(files);
    });

    it('添加文件失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.add.mockRejectedValue(new Error('添加失败'));

      await expect(gitManager.addFiles(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('commit - 提交更改测试', () => {
    it('应该成功提交更改', async () => {
      const message = 'feat: 添加新功能';
      const commitHash = 'a1b2c3d4e5f6';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.commit.mockResolvedValue({ commit: commitHash });

      const result = await gitManager.commit(testWorkspacePath, message);

      expect(result).toBe(commitHash);
      expect(mockGitInstance.commit).toHaveBeenCalledWith(message, []);
    });

    it('应该支持带选项的提交', async () => {
      const message = 'fix: 修复 bug';
      const options = {
        author: 'Test User <test@example.com>',
        sign: true,
        noVerify: true,
        amend: true,
      };
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.commit.mockResolvedValue({ commit: 'hash123' });

      await gitManager.commit(testWorkspacePath, message, options);

      expect(mockGitInstance.commit).toHaveBeenCalledWith(message, [
        '--author',
        'Test User <test@example.com>',
        '--signoff',
        '--no-verify',
        '--amend',
      ]);
    });

    it('提交失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.commit.mockRejectedValue(new Error('没有可提交的更改'));

      await expect(
        gitManager.commit(testWorkspacePath, 'test commit')
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('push - 推送到远程仓库测试', () => {
    it('应该成功推送到远程仓库', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');
      mockGitInstance.push.mockResolvedValue(undefined);

      const result = await gitManager.push(testWorkspacePath, 'origin', 'main');

      expect(result).toBe(true);
      expect(mockGitInstance.push).toHaveBeenCalledWith('origin', 'main', []);
    });

    it('未指定分支时应该使用当前分支', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('develop\n');
      mockGitInstance.push.mockResolvedValue(undefined);

      await gitManager.push(testWorkspacePath);

      expect(mockGitInstance.push).toHaveBeenCalledWith('origin', 'develop', []);
    });

    it('应该支持带选项的推送', async () => {
      const options = {
        force: true,
        setUpstream: true,
        forceWithLease: true,
        tags: true,
      };
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');
      mockGitInstance.push.mockResolvedValue(undefined);

      await gitManager.push(testWorkspacePath, 'origin', 'main', options);

      expect(mockGitInstance.push).toHaveBeenCalledWith('origin', 'main', [
        '--force',
        '--set-upstream',
        '--force-with-lease',
        '--tags',
      ]);
    });

    it('推送失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');
      mockGitInstance.push.mockRejectedValue(new Error('推送失败'));

      await expect(gitManager.push(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });

    it('无法确定当前分支时应该抛出错误', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('\n');

      await expect(gitManager.push(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('pull - 拉取远程更改测试', () => {
    it('应该成功拉取远程更改', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');
      mockGitInstance.pull.mockResolvedValue(undefined);

      const result = await gitManager.pull(testWorkspacePath, 'origin', 'main');

      expect(result).toBe(true);
      expect(mockGitInstance.pull).toHaveBeenCalledWith('origin', 'main');
    });

    it('未指定分支时应该使用当前分支', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('develop\n');
      mockGitInstance.pull.mockResolvedValue(undefined);

      await gitManager.pull(testWorkspacePath);

      expect(mockGitInstance.pull).toHaveBeenCalledWith('origin', 'develop');
    });

    it('拉取失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.revparse.mockResolvedValue('main\n');
      mockGitInstance.pull.mockRejectedValue(new Error('拉取失败'));

      await expect(gitManager.pull(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('getCommitHistory - 获取提交历史测试', () => {
    it('应该成功获取提交历史', async () => {
      const mockLogResult = {
        total: 2,
        all: [
          {
            hash: 'a1b2c3d',
            message: 'feat: 添加新功能',
            author_name: 'Test User',
            date: '2024-01-15 10:30:00',
            body: '详细描述',
          },
          {
            hash: 'e5f6g7h',
            message: 'fix: 修复 bug',
            author_name: 'Test User',
            date: '2024-01-14 15:45:00',
            body: '',
          },
        ],
      };

      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.log.mockResolvedValue(mockLogResult);

      const result = await gitManager.getCommitHistory(testWorkspacePath);

      expect(result.total).toBe(2);
      expect(result.commits).toHaveLength(2);
      expect(result.commits[0].hash).toBe('a1b2c3d');
      expect(result.commits[0].message).toBe('feat: 添加新功能');
      expect(result.commits[0].author).toBe('Test User');
      expect(result.commits[0].timestamp).toBeDefined();
    });

    it('应该支持限制提交历史条数', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.log.mockResolvedValue({ total: 0, all: [] });

      await gitManager.getCommitHistory(testWorkspacePath, 10);

      expect(mockGitInstance.log).toHaveBeenCalledWith({
        '--max-count': 10,
      });
    });

    it('获取提交历史失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.log.mockRejectedValue(new Error('获取失败'));

      await expect(gitManager.getCommitHistory(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('getRemotes - 获取远程仓库列表测试', () => {
    it('应该成功获取远程仓库列表', async () => {
      const mockRemotes = [
        { name: 'origin', refs: { fetch: '', push: '' } },
      ];
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.getRemotes.mockResolvedValue(mockRemotes);
      mockGitInstance.remote.mockResolvedValue(
        'https://github.com/test/repo.git\n'
      );

      const result = await gitManager.getRemotes(testWorkspacePath);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('origin');
      expect(result[0].url).toBe('https://github.com/test/repo.git');
    });

    it('当没有远程仓库时应该返回空数组', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.getRemotes.mockResolvedValue([]);

      const result = await gitManager.getRemotes(testWorkspacePath);

      expect(result).toEqual([]);
    });

    it('获取远程仓库列表失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.getRemotes.mockRejectedValue(new Error('获取失败'));

      await expect(gitManager.getRemotes(testWorkspacePath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('addRemote - 添加远程仓库测试', () => {
    it('应该成功添加远程仓库', async () => {
      const remoteName = 'upstream';
      const remoteUrl = 'https://github.com/upstream/repo.git';
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.addRemote.mockResolvedValue(undefined);

      const result = await gitManager.addRemote(
        testWorkspacePath,
        remoteName,
        remoteUrl
      );

      expect(result).toBe(true);
      expect(mockGitInstance.addRemote).toHaveBeenCalledWith(
        remoteName,
        remoteUrl
      );
    });

    it('添加远程仓库失败时应该抛出 GitOperationError', async () => {
      mockGitInstance.checkIsRepo.mockResolvedValue(true);
      mockGitInstance.addRemote.mockRejectedValue(new Error('远程已存在'));

      await expect(
        gitManager.addRemote(
          testWorkspacePath,
          'origin',
          'https://github.com/test/repo.git'
        )
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('cloneRepo - 克隆仓库测试', () => {
    it('应该成功克隆远程仓库', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      const targetPath = '/tmp/clone-target';
      mockGitInstance.clone.mockResolvedValue(undefined);

      const result = await gitManager.cloneRepo(gitUrl, targetPath);

      expect(result).toBe(true);
      expect(mockSimpleGit).toHaveBeenCalled();
      expect(mockGitInstance.clone).toHaveBeenCalledWith(gitUrl, targetPath, []);
    });

    it('应该支持带选项的克隆', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      const targetPath = '/tmp/clone-target';
      const options = {
        depth: 1,
        branch: 'main',
        singleBranch: true,
      };
      mockGitInstance.clone.mockResolvedValue(undefined);

      await gitManager.cloneRepo(gitUrl, targetPath, options);

      expect(mockGitInstance.clone).toHaveBeenCalledWith(
        gitUrl,
        targetPath,
        ['--depth', '1', '--branch', 'main', '--single-branch']
      );
    });

    it('克隆失败时应该抛出 GitOperationError', async () => {
      const gitUrl = 'https://github.com/test/repo.git';
      const targetPath = '/tmp/clone-target';
      mockGitInstance.clone.mockRejectedValue(new Error('克隆失败'));

      await expect(gitManager.cloneRepo(gitUrl, targetPath)).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('createPR - 创建 Pull Request 测试', () => {
    it('应该成功创建 Pull Request', async () => {
      const title = 'feat: 添加新功能';
      const body = '这是一个测试 PR';
      const baseBranch = 'main';
      const headBranch = 'feature/test';
      const prUrl = 'https://github.com/test/repo/pull/1';

      mockExecAsync.mockResolvedValue({ stdout: prUrl, stderr: '' });

      const result = await gitManager.createPR(
        testWorkspacePath,
        title,
        body,
        baseBranch,
        headBranch
      );

      expect(result).toBe(prUrl);
    });

    it('创建 PR 失败时应该抛出 GitOperationError', async () => {
      mockExecAsync.mockRejectedValue(new Error('gh 命令失败'));

      await expect(
        gitManager.createPR(
          testWorkspacePath,
          'title',
          'body',
          'main',
          'feature'
        )
      ).rejects.toThrow(GitOperationError);
    });
  });

  describe('reviewPR - 审查 Pull Request 测试', () => {
    it('应该成功获取 PR 信息', async () => {
      const prId = '123';
      const prInfo = JSON.stringify({
        number: 123,
        title: 'Test PR',
        state: 'open',
        headRefName: 'feature/test',
        baseRefName: 'main',
        url: 'https://github.com/test/repo/pull/123',
      });

      mockExecAsync.mockResolvedValue({ stdout: prInfo, stderr: '' });

      const result = await gitManager.reviewPR(testWorkspacePath, prId);

      expect(result).toBe(prInfo);
    });

    it('获取 PR 信息失败时应该抛出 GitOperationError', async () => {
      mockExecAsync.mockRejectedValue(new Error('PR 不存在'));

      await expect(gitManager.reviewPR(testWorkspacePath, '999')).rejects.toThrow(
        GitOperationError
      );
    });
  });

  describe('错误处理测试', () => {
    it('路径校验失败时应该抛出 GitOperationError', async () => {
      const { validatePath } = jest.requireMock('../../src/utils/validator');
      validatePath.mockImplementationOnce(() => {
        throw new Error('无效的路径');
      });

      await expect(gitManager.initRepo('/invalid/path')).rejects.toThrow(
        GitOperationError
      );
    });

    it('当 Git 命令执行失败时应该正确包装错误信息', async () => {
      mockGitInstance.checkIsRepo.mockRejectedValue(
        new Error('git: command not found')
      );

      try {
        await gitManager.getStatus(testWorkspacePath);
        fail('应该抛出错误');
      } catch (error) {
        expect(error).toBeInstanceOf(GitOperationError);
        if (error instanceof GitOperationError) {
          expect(error.operation).toBe('getStatus');
          expect(error.workspacePath).toBe(testWorkspacePath);
        }
      }
    });

    it('GitRepoNotFoundError 应该包含工作区路径', () => {
      const error = new GitRepoNotFoundError(testWorkspacePath);
      expect(error.message).toContain(testWorkspacePath);
      expect(error.workspacePath).toBe(testWorkspacePath);
    });

    it('GitOperationError 应该包含完整的错误上下文', () => {
      const context = { operation: 'test', detail: 'info' };
      const error = new GitOperationError(
        '测试错误',
        'testOp',
        testWorkspacePath,
        context
      );
      expect(error.message).toBe('测试错误');
      expect(error.operation).toBe('testOp');
      expect(error.workspacePath).toBe(testWorkspacePath);
      expect(error.context).toEqual(context);
    });
  });
});
