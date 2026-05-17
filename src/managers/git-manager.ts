import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult, DefaultLogFields } from 'simple-git';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  GitBranchSummary,
  GitStatus,
  GitCommitHistory,
  GitRemoteInfo,
  GitCommitOptions,
  GitPushOptions,
  GitCloneOptions,
  GitOperationError,
  GitRepoNotFoundError,
  LoggerContext,
} from '../types';
import { Logger } from '../utils/logger';
import { validatePath } from '../utils/validator';
import { SecurityUtils } from '../utils/security';

const execAsync = promisify(exec);

/**
 * Git 管理器
 * 使用 simple-git 库提供 Git 操作功能
 */
export class GitManager {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('GitManager');
  }

  /**
   * 验证并获取 Git 实例
   */
  private getGitInstance(workspacePath: string): SimpleGit {
    try {
      validatePath(workspacePath);
      SecurityUtils.validatePath(workspacePath);
      return simpleGit(workspacePath);
    } catch (error) {
      throw new GitOperationError(
        `路径校验失败: ${error instanceof Error ? error.message : String(error)}`,
        'getGitInstance',
        workspacePath
      );
    }
  }

  /**
   * 检查是否是有效的 Git 仓库
   */
  private async checkIsRepo(git: SimpleGit, workspacePath: string): Promise<void> {
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        throw new GitRepoNotFoundError(workspacePath);
      }
    } catch (error) {
      if (error instanceof GitRepoNotFoundError) {
        throw error;
      }
      throw new GitOperationError(
        `检查仓库状态失败: ${error instanceof Error ? error.message : String(error)}`,
        'checkIsRepo',
        workspacePath
      );
    }
  }

  /**
   * 初始化 Git 仓库或关联现有仓库
   * @param workspacePath 工作区路径
   * @param gitUrl 可选的远程仓库地址
   */
  async initRepo(workspacePath: string, gitUrl?: string): Promise<boolean> {
    const context: LoggerContext = { workspacePath, gitUrl };
    this.logger.info('开始初始化 Git 仓库', context);

    try {
      validatePath(workspacePath);
      SecurityUtils.validatePath(workspacePath);

      const git = simpleGit(workspacePath);

      // 检查是否已经是 Git 仓库
      const isRepo = await git.checkIsRepo();

      if (isRepo) {
        this.logger.info('工作区已经是 Git 仓库', context);

        // 如果提供了 gitUrl，添加或更新 origin
        if (gitUrl) {
          try {
            await git.remote(['set-url', 'origin', gitUrl]);
            this.logger.info('已更新远程仓库地址', { ...context, remote: 'origin' });
          } catch {
            // 如果 set-url 失败，说明 origin 不存在，尝试添加
            await git.addRemote('origin', gitUrl);
            this.logger.info('已添加远程仓库', { ...context, remote: 'origin' });
          }
        }

        return true;
      }

      // 初始化新仓库
      await git.init();
      this.logger.info('Git 仓库初始化成功', context);

      // 如果提供了 gitUrl，添加远程仓库
      if (gitUrl) {
        await git.addRemote('origin', gitUrl);
        this.logger.info('已添加远程仓库', { ...context, remote: 'origin' });
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Git 仓库初始化失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `Git 仓库初始化失败: ${errorMessage}`,
        'initRepo',
        workspacePath,
        context
      );
    }
  }

  /**
   * 克隆远程仓库
   * @param gitUrl 远程仓库地址
   * @param targetPath 目标路径
   * @param options 克隆选项
   */
  async cloneRepo(
    gitUrl: string,
    targetPath: string,
    options?: GitCloneOptions
  ): Promise<boolean> {
    const context: LoggerContext = { gitUrl, targetPath, options };
    this.logger.info('开始克隆远程仓库', context);

    try {
      validatePath(targetPath);
      SecurityUtils.validatePath(targetPath);

      const cloneOptions: string[] = [];

      if (options?.depth) {
        cloneOptions.push('--depth', options.depth.toString());
      }
      if (options?.branch) {
        cloneOptions.push('--branch', options.branch);
      }
      if (options?.singleBranch) {
        cloneOptions.push('--single-branch');
      }
      if (options?.bare) {
        cloneOptions.push('--bare');
      }
      if (options?.mirror) {
        cloneOptions.push('--mirror');
      }

      await simpleGit().clone(gitUrl, targetPath, cloneOptions);
      this.logger.info('远程仓库克隆成功', context);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('远程仓库克隆失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `远程仓库克隆失败: ${errorMessage}`,
        'cloneRepo',
        targetPath,
        context
      );
    }
  }

  /**
   * 获取工作区状态
   * @param workspacePath 工作区路径
   */
  async getStatus(workspacePath: string): Promise<GitStatus> {
    const context: LoggerContext = { workspacePath };
    this.logger.debug('获取工作区状态', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const status: StatusResult = await git.status();

      const result: GitStatus = {
        isRepo: true,
        staged: status.staged,
        modified: status.modified,
        deleted: status.deleted,
        untracked: status.not_added,
        conflicted: status.conflicted,
        renamed: status.renamed.map((r) => r.to),
        currentBranch: status.current || undefined,
        latestCommit: undefined,
        tracking: status.tracking || undefined,
        ahead: status.ahead,
        behind: status.behind,
        notAdded: status.not_added,
      };

      this.logger.debug('获取工作区状态成功', context);
      return result;
    } catch (error) {
        if (error instanceof GitRepoNotFoundError) {
          return {
            isRepo: false,
            staged: [],
            modified: [],
            deleted: [],
            untracked: [],
            conflicted: [],
            renamed: [],
            ahead: 0,
            behind: 0,
            notAdded: [],
          };
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('获取工作区状态失败', error instanceof Error ? error : undefined, context);
        throw new GitOperationError(
          `获取工作区状态失败: ${errorMessage}`,
          'getStatus',
          workspacePath,
          context
        );
      }
    }

  /**
   * 获取所有分支列表
   * @param workspacePath 工作区路径
   */
  async getBranches(workspacePath: string): Promise<GitBranchSummary> {
    const context: LoggerContext = { workspacePath };
    this.logger.debug('获取分支列表', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const branches: BranchSummary = await git.branch();

      const result: GitBranchSummary = {
        all: branches.all,
        branches: branches.all.map((name) => ({
          name,
          current: name === branches.current,
          commit: branches.branches[name]?.commit,
          label: branches.branches[name]?.label,
        })),
        current: branches.current,
        detached: branches.detached,
      };

      this.logger.debug('获取分支列表成功', { ...context, count: result.all.length });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('获取分支列表失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `获取分支列表失败: ${errorMessage}`,
        'getBranches',
        workspacePath,
        context
      );
    }
  }

  /**
   * 获取当前分支
   * @param workspacePath 工作区路径
   */
  async getCurrentBranch(workspacePath: string): Promise<string | null> {
    const context: LoggerContext = { workspacePath };
    this.logger.debug('获取当前分支', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const branchName = await git.revparse(['--abbrev-ref', 'HEAD']);
      const result = branchName.trim();

      this.logger.debug('获取当前分支成功', { ...context, branch: result });
      return result || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('获取当前分支失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `获取当前分支失败: ${errorMessage}`,
        'getCurrentBranch',
        workspacePath,
        context
      );
    }
  }

  /**
   * 创建新分支
   * @param workspacePath 工作区路径
   * @param branchName 分支名称
   * @param fromBranch 源分支（可选，默认当前分支）
   */
  async createBranch(
    workspacePath: string,
    branchName: string,
    fromBranch?: string
  ): Promise<boolean> {
    const context: LoggerContext = { workspacePath, branchName, fromBranch };
    this.logger.info('创建新分支', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      if (fromBranch) {
        await git.checkoutBranch(branchName, fromBranch);
      } else {
        await git.checkoutLocalBranch(branchName);
      }

      this.logger.info('分支创建成功', { ...context, branch: branchName });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('分支创建失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `分支创建失败: ${errorMessage}`,
        'createBranch',
        workspacePath,
        context
      );
    }
  }

  /**
   * 切换分支
   * @param workspacePath 工作区路径
   * @param branchName 分支名称
   */
  async checkoutBranch(workspacePath: string, branchName: string): Promise<boolean> {
    const context: LoggerContext = { workspacePath, branchName };
    this.logger.info('切换分支', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      await git.checkout(branchName);

      this.logger.info('分支切换成功', { ...context, branch: branchName });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('分支切换失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `分支切换失败: ${errorMessage}`,
        'checkoutBranch',
        workspacePath,
        context
      );
    }
  }

  /**
   * 删除分支
   * @param workspacePath 工作区路径
   * @param branchName 分支名称
   * @param force 是否强制删除
   */
  async deleteBranch(
    workspacePath: string,
    branchName: string,
    force = false
  ): Promise<boolean> {
    const context: LoggerContext = { workspacePath, branchName, force };
    this.logger.info('删除分支', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      await git.deleteLocalBranch(branchName, force);

      this.logger.info('分支删除成功', { ...context, branch: branchName });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('分支删除失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `分支删除失败: ${errorMessage}`,
        'deleteBranch',
        workspacePath,
        context
      );
    }
  }

  /**
   * 添加文件到暂存区
   * @param workspacePath 工作区路径
   * @param files 文件列表（不传参数添加所有）
   */
  async addFiles(workspacePath: string, files?: string[]): Promise<boolean> {
    const context: LoggerContext = { workspacePath, filesCount: files?.length };
    this.logger.debug('添加文件到暂存区', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      if (files && files.length > 0) {
        // 校验每个文件路径
        files.forEach((file) => SecurityUtils.validatePath(file));
        await git.add(files);
        this.logger.debug('已添加指定文件到暂存区', { ...context, files });
      } else {
        await git.add('.');
        this.logger.debug('已添加所有文件到暂存区', context);
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('添加文件到暂存区失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `添加文件到暂存区失败: ${errorMessage}`,
        'addFiles',
        workspacePath,
        context
      );
    }
  }

  /**
   * 提交更改
   * @param workspacePath 工作区路径
   * @param message 提交信息
   * @param options 提交选项
   */
  async commit(
    workspacePath: string,
    message: string,
    options?: GitCommitOptions
  ): Promise<string> {
    const context: LoggerContext = { workspacePath, messageLength: message.length, options };
    this.logger.info('提交更改', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const commitOptions: string[] = [];

      if (options?.author) {
        commitOptions.push('--author', options.author);
      }
      if (options?.sign) {
        commitOptions.push('--signoff');
      }
      if (options?.noVerify) {
        commitOptions.push('--no-verify');
      }
      if (options?.amend) {
        commitOptions.push('--amend');
      }

      const result = await git.commit(message, commitOptions);

      this.logger.info('提交成功', { ...context, commitHash: result.commit });
      return result.commit || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('提交失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `提交失败: ${errorMessage}`,
        'commit',
        workspacePath,
        context
      );
    }
  }

  /**
   * 推送到远程仓库
   * @param workspacePath 工作区路径
   * @param remote 远程仓库名称（默认 origin）
   * @param branch 分支名称（默认当前分支）
   * @param options 推送选项
   */
  async push(
    workspacePath: string,
    remote = 'origin',
    branch?: string,
    options?: GitPushOptions
  ): Promise<boolean> {
    const context: LoggerContext = { workspacePath, remote, branch, options };
    this.logger.info('推送到远程仓库', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const pushOptions: string[] = [];

      if (options?.force) {
        pushOptions.push('--force');
      }
      if (options?.setUpstream) {
        pushOptions.push('--set-upstream');
      }
      if (options?.forceWithLease) {
        pushOptions.push('--force-with-lease');
      }
      if (options?.tags) {
        pushOptions.push('--tags');
      }

      const targetBranch = branch || (await this.getCurrentBranch(workspacePath));
      if (!targetBranch) {
        throw new GitOperationError('无法确定当前分支', 'push', workspacePath, context);
      }

      await git.push(remote, targetBranch, pushOptions);

      this.logger.info('推送成功', { ...context, branch: targetBranch });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('推送失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `推送失败: ${errorMessage}`,
        'push',
        workspacePath,
        context
      );
    }
  }

  /**
   * 拉取远程更改
   * @param workspacePath 工作区路径
   * @param remote 远程仓库名称（默认 origin）
   * @param branch 分支名称（默认当前分支）
   */
  async pull(
    workspacePath: string,
    remote = 'origin',
    branch?: string
  ): Promise<boolean> {
    const context: LoggerContext = { workspacePath, remote, branch };
    this.logger.info('拉取远程更改', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const targetBranch = branch || (await this.getCurrentBranch(workspacePath));
      if (!targetBranch) {
        throw new GitOperationError('无法确定当前分支', 'pull', workspacePath, context);
      }

      await git.pull(remote, targetBranch);

      this.logger.info('拉取成功', { ...context, branch: targetBranch });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('拉取失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `拉取失败: ${errorMessage}`,
        'pull',
        workspacePath,
        context
      );
    }
  }

  /**
   * 获取提交历史
   * @param workspacePath 工作区路径
   * @param limit 限制条数
   */
  async getCommitHistory(
    workspacePath: string,
    limit = 50
  ): Promise<GitCommitHistory> {
    const context: LoggerContext = { workspacePath, limit };
    this.logger.debug('获取提交历史', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const logResult: LogResult<DefaultLogFields> = await git.log({
        '--max-count': limit,
      });

      const result: GitCommitHistory = {
        total: logResult.total,
        commits: logResult.all.map((commit) => ({
          hash: commit.hash,
          message: commit.message,
          author: commit.author_name,
          date: commit.date,
          timestamp: new Date(commit.date).getTime(),
          body: commit.body,
        })),
      };

      this.logger.debug('获取提交历史成功', { ...context, count: result.commits.length });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('获取提交历史失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `获取提交历史失败: ${errorMessage}`,
        'getCommitHistory',
        workspacePath,
        context
      );
    }
  }

  /**
   * 获取远程仓库列表
   * @param workspacePath 工作区路径
   */
  async getRemotes(workspacePath: string): Promise<GitRemoteInfo[]> {
    const context: LoggerContext = { workspacePath };
    this.logger.debug('获取远程仓库列表', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      const remoteNames = await git.getRemotes();
      const remotes: GitRemoteInfo[] = [];

      for (const remote of remoteNames) {
        const urls = await git.remote(['get-url', '--all', remote.name]);
        const url = (typeof urls === 'string' ? urls : '').trim().split('\n')[0];
        remotes.push({
          name: remote.name,
          url,
        });
      }

      this.logger.debug('获取远程仓库列表成功', { ...context, count: remotes.length });
      return remotes;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('获取远程仓库列表失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `获取远程仓库列表失败: ${errorMessage}`,
        'getRemotes',
        workspacePath,
        context
      );
    }
  }

  /**
   * 添加远程仓库
   * @param workspacePath 工作区路径
   * @param remoteName 远程仓库名称
   * @param remoteUrl 远程仓库地址
   */
  async addRemote(
    workspacePath: string,
    remoteName: string,
    remoteUrl: string
  ): Promise<boolean> {
    const context: LoggerContext = { workspacePath, remoteName, remoteUrl };
    this.logger.info('添加远程仓库', context);

    try {
      const git = this.getGitInstance(workspacePath);
      await this.checkIsRepo(git, workspacePath);

      await git.addRemote(remoteName, remoteUrl);

      this.logger.info('远程仓库添加成功', context);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('远程仓库添加失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `远程仓库添加失败: ${errorMessage}`,
        'addRemote',
        workspacePath,
        context
      );
    }
  }

  /**
   * 创建 Pull Request（调用 gh 命令）
   * @param workspacePath 工作区路径
   * @param title PR 标题
   * @param body PR 描述
   * @param baseBranch 目标分支
   * @param headBranch 源分支
   */
  async createPR(
    workspacePath: string,
    title: string,
    body: string,
    baseBranch: string,
    headBranch: string
  ): Promise<string> {
    const context: LoggerContext = { workspacePath, title, baseBranch, headBranch };
    this.logger.info('创建 Pull Request', context);

    try {
      validatePath(workspacePath);
      SecurityUtils.validatePath(workspacePath);

      // 构建 gh pr create 命令
      const command = [
        'gh',
        'pr',
        'create',
        '--title',
        `"${title.replace(/"/g, '\\"')}"`,
        '--body',
        `"${body.replace(/"/g, '\\"')}"`,
        '--base',
        baseBranch,
        '--head',
        headBranch,
      ].join(' ');

      // 校验命令安全性
      SecurityUtils.validateCommand(command);

      const { stdout, stderr } = await execAsync(command, {
        cwd: workspacePath,
      });

      if (stderr && !stderr.includes('https://')) {
        throw new Error(stderr);
      }

      const prUrl = stdout.trim() || stderr.trim();

      this.logger.info('Pull Request 创建成功', { ...context, prUrl });
      return prUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Pull Request 创建失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `Pull Request 创建失败: ${errorMessage}`,
        'createPR',
        workspacePath,
        context
      );
    }
  }

  /**
   * 审查 Pull Request（调用 gh 命令）
   * @param workspacePath 工作区路径
   * @param prId PR 编号
   */
  async reviewPR(workspacePath: string, prId: string): Promise<string> {
    const context: LoggerContext = { workspacePath, prId };
    this.logger.info('审查 Pull Request', context);

    try {
      validatePath(workspacePath);
      SecurityUtils.validatePath(workspacePath);

      // 构建 gh pr view 命令获取 PR 信息
      const command = `gh pr view ${prId} --json number,title,state,headRefName,baseRefName,url`;

      // 校验命令安全性
      SecurityUtils.validateCommand(command);

      const { stdout } = await execAsync(command, {
        cwd: workspacePath,
      });

      const result = stdout.trim();

      this.logger.debug('Pull Request 信息获取成功', { ...context, prId });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Pull Request 审查失败', error instanceof Error ? error : undefined, context);
      throw new GitOperationError(
        `Pull Request 审查失败: ${errorMessage}`,
        'reviewPR',
        workspacePath,
        context
      );
    }
  }
}

/**
 * 默认 GitManager 单例
 */
export const defaultGitManager = new GitManager();

export default GitManager;
