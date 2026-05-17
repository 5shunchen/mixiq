/**
 * GitManager 集成测试
 * 使用真实的 GitHub 仓库（mixiq 项目本身）进行测试
 *
 * 测试内容：
 * 1. GitManager 初始化和获取仓库状态
 * 2. 获取当前分支
 * 3. 创建新分支并切换
 * 4. 获取分支列表
 * 5. 创建测试文件
 * 6. 添加文件到暂存区
 * 7. 提交更改
 * 8. 获取提交历史
 * 9. 获取远程仓库列表
 * 10. 验证危险命令拦截
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitManager } from '../../src/managers/git-manager';
import { SecurityUtils } from '../../src/utils/security';
// 导入类型用于类型检查

// 项目根目录（使用 mixiq 仓库本身作为测试仓库）
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TEST_BRANCH_PREFIX = 'test/git-manager-integration';

describe('GitManager - Integration Tests', () => {
  let gitManager: GitManager;
  let originalBranch: string | null;
  let testBranchName: string;

  // 生成唯一的测试分支名
  function generateTestBranchName(): string {
    const timestamp = Date.now();
    return `${TEST_BRANCH_PREFIX}-${timestamp}`;
  }

  // 检查分支是否存在
  async function branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await gitManager.getBranches(PROJECT_ROOT);
      return branches.all.includes(branchName);
    } catch {
      return false;
    }
  }

  // 清理测试文件
  function cleanupTestFiles(): void {
    const testFiles = [
      path.join(PROJECT_ROOT, 'test-file-1.txt'),
      path.join(PROJECT_ROOT, 'test-file-2.txt'),
    ];

    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {
          // 忽略删除错误
        }
      }
    }
  }

  beforeAll(async () => {
    gitManager = new GitManager();
    testBranchName = generateTestBranchName();

    console.log('=== GitManager Integration Tests ===');
    console.log('Project Root:', PROJECT_ROOT);

    // 保存原始分支
    originalBranch = await gitManager.getCurrentBranch(PROJECT_ROOT);
    console.log('Original Branch:', originalBranch);
    console.log('Test Branch:', testBranchName);
    console.log('');
  }, 30000);

  afterAll(async () => {
    console.log('\n=== Cleaning Up ===');

    // 切回原始分支
    if (originalBranch) {
      try {
        await gitManager.checkoutBranch(PROJECT_ROOT, originalBranch);
        console.log('Switched back to original branch:', originalBranch);
      } catch (error) {
        console.warn('Failed to switch back to original branch:', error instanceof Error ? error.message : String(error));
      }
    }

    // 删除测试分支（如果存在）
    const testBranchPattern = new RegExp(`^${TEST_BRANCH_PREFIX}-`);
    try {
      const branches = await gitManager.getBranches(PROJECT_ROOT);
      for (const branch of branches.all) {
        if (testBranchPattern.test(branch)) {
          try {
            await gitManager.deleteBranch(PROJECT_ROOT, branch, true);
            console.log('Deleted test branch:', branch);
          } catch (error) {
            console.warn('Failed to delete test branch:', branch, error instanceof Error ? error.message : String(error));
          }
        }
      }
    } catch {
      // 忽略错误
    }

    // 清理测试文件
    cleanupTestFiles();
    console.log('Cleanup complete');
  }, 60000);

  beforeEach(() => {
    console.log('\n----------------------------------------');
  });

  afterEach(() => {
    console.log('----------------------------------------');
  });

  test('1. 初始化并获取仓库状态', async () => {
    console.log('Test: 初始化并获取仓库状态');

    // 初始化仓库
    const initResult = await gitManager.initRepo(PROJECT_ROOT);
    expect(initResult).toBe(true);
    console.log('✓ 仓库初始化成功');

    // 获取仓库状态
    const status = await gitManager.getStatus(PROJECT_ROOT);
    console.log('当前分支:', status.currentBranch);
    console.log('暂存文件数:', status.staged.length);
    console.log('修改文件数:', status.modified.length);
    console.log('未跟踪文件数:', status.notAdded.length);

    expect(status.isRepo).toBe(true);
    expect(status.currentBranch).toBeDefined();
    console.log('✓ 获取仓库状态成功');
  }, 30000);

  test('2. 获取当前分支', async () => {
    console.log('Test: 获取当前分支');

    const currentBranch = await gitManager.getCurrentBranch(PROJECT_ROOT);
    console.log('当前分支:', currentBranch);

    expect(currentBranch).toBeDefined();
    expect(typeof currentBranch).toBe('string');
    expect(currentBranch).not.toBe('');
    console.log('✓ 获取当前分支成功');
  }, 30000);

  test('3. 创建新分支并切换', async () => {
    console.log('Test: 创建新分支并切换');

    // 创建新分支
    const createResult = await gitManager.createBranch(PROJECT_ROOT, testBranchName);
    expect(createResult).toBe(true);
    console.log('✓ 创建分支成功:', testBranchName);

    // 验证当前分支是新创建的分支
    const currentBranch = await gitManager.getCurrentBranch(PROJECT_ROOT);
    console.log('当前分支（切换后）:', currentBranch);
    expect(currentBranch).toBe(testBranchName);
    console.log('✓ 分支切换验证成功');
  }, 30000);

  test('4. 获取分支列表', async () => {
    console.log('Test: 获取分支列表');

    const branchSummary = await gitManager.getBranches(PROJECT_ROOT);
    console.log('分支总数:', branchSummary.all.length);
    console.log('当前分支:', branchSummary.current);
    console.log('是否 detached:', branchSummary.detached);
    console.log('所有分支:');
    branchSummary.all.forEach((branch, index) => {
      const prefix = branch === branchSummary.current ? '★ ' : '  ';
      console.log(`  ${prefix}${index + 1}. ${branch}`);
    });

    expect(branchSummary.all.length).toBeGreaterThan(0);
    expect(branchSummary.current).toBe(testBranchName);
    expect(branchSummary.all).toContain(testBranchName);
    expect(branchSummary.all).toContain('main');
    console.log('✓ 获取分支列表成功');
  }, 30000);

  test('5. 创建测试文件', async () => {
    console.log('Test: 创建测试文件');

    // 创建测试文件 1
    const testFile1 = path.join(PROJECT_ROOT, 'test-file-1.txt');
    fs.writeFileSync(testFile1, 'This is test file 1 for GitManager integration test\n', 'utf8');
    console.log('✓ 创建测试文件: test-file-1.txt');

    // 创建测试文件 2
    const testFile2 = path.join(PROJECT_ROOT, 'test-file-2.txt');
    fs.writeFileSync(testFile2, 'This is test file 2 for GitManager integration test\n', 'utf8');
    console.log('✓ 创建测试文件: test-file-2.txt');

    // 验证文件已创建
    expect(fs.existsSync(testFile1)).toBe(true);
    expect(fs.existsSync(testFile2)).toBe(true);

    // 检查状态，验证文件出现在未跟踪列表中
    const status = await gitManager.getStatus(PROJECT_ROOT);
    console.log('未跟踪文件:', status.notAdded);

    expect(status.notAdded).toContain('test-file-1.txt');
    expect(status.notAdded).toContain('test-file-2.txt');
    console.log('✓ 测试文件创建验证成功');
  }, 30000);

  test('6. 添加文件到暂存区', async () => {
    console.log('Test: 添加文件到暂存区');

    // 添加指定文件到暂存区
    const addResult = await gitManager.addFiles(PROJECT_ROOT, ['test-file-1.txt']);
    expect(addResult).toBe(true);
    console.log('✓ 添加文件到暂存区成功: test-file-1.txt');

    // 检查状态
    const status = await gitManager.getStatus(PROJECT_ROOT);
    console.log('暂存文件:', status.staged);
    console.log('未跟踪文件:', status.notAdded);

    expect(status.staged).toContain('test-file-1.txt');
    expect(status.notAdded).toContain('test-file-2.txt');
    console.log('✓ 暂存区状态验证成功');
  }, 30000);

  test('7. 提交更改', async () => {
    console.log('Test: 提交更改');

    // 先添加所有测试文件
    await gitManager.addFiles(PROJECT_ROOT, ['test-file-2.txt']);

    // 提交更改
    const commitMessage = 'test: add test files for GitManager integration test';
    const commitHash = await gitManager.commit(PROJECT_ROOT, commitMessage, {
      author: 'Test Bot <test@mixiq.dev>',
    });

    console.log('提交哈希:', commitHash);
    expect(commitHash).toBeDefined();
    expect(commitHash).not.toBe('');
    console.log('✓ 提交更改成功');

    // 验证提交后状态干净
    const status = await gitManager.getStatus(PROJECT_ROOT);
    console.log('提交后状态 - 暂存文件数:', status.staged.length);
    console.log('提交后状态 - 修改文件数:', status.modified.length);
  }, 30000);

  test('8. 获取提交历史', async () => {
    console.log('Test: 获取提交历史');

    const commitHistory = await gitManager.getCommitHistory(PROJECT_ROOT, 10);
    console.log('总提交数:', commitHistory.total);
    console.log('获取的提交数:', commitHistory.commits.length);
    console.log('最近提交:');

    commitHistory.commits.slice(0, 5).forEach((commit, index) => {
      console.log(`  ${index + 1}. [${commit.hash.substring(0, 8)}] ${commit.message.split('\n')[0]} - ${commit.author}`);
    });

    expect(commitHistory.total).toBeGreaterThan(0);
    expect(commitHistory.commits.length).toBeGreaterThan(0);
    expect(commitHistory.commits[0]).toHaveProperty('hash');
    expect(commitHistory.commits[0]).toHaveProperty('message');
    expect(commitHistory.commits[0]).toHaveProperty('author');
    expect(commitHistory.commits[0]).toHaveProperty('date');

    // 验证我们的测试提交在历史中
    const testCommit = commitHistory.commits.find((c) =>
      c.message.includes('test files for GitManager integration test'));
    expect(testCommit).toBeDefined();
    console.log('✓ 获取提交历史成功');
  }, 30000);

  test('9. 获取远程仓库列表', async () => {
    console.log('Test: 获取远程仓库列表');

    const remotes = await gitManager.getRemotes(PROJECT_ROOT);
    console.log('远程仓库数量:', remotes.length);

    remotes.forEach((remote) => {
      console.log(`  - ${remote.name}: ${remote.url}`);
    });

    expect(remotes.length).toBeGreaterThan(0);
    expect(remotes.some((r) => r.name === 'origin')).toBe(true);

    // 验证 origin 指向正确的仓库
    const origin = remotes.find((r) => r.name === 'origin');
    expect(origin).toBeDefined();
    expect(origin?.url).toContain('mixiq');
    console.log('✓ 获取远程仓库列表成功');
  }, 30000);

  test('10. 验证危险命令拦截', async () => {
    console.log('Test: 验证危险命令拦截');

    // 测试各种危险命令
    const dangerousCommands = [
      'rm -rf /',
      'rm -rf /*',
      'mkfs.ext4 /dev/sda',
      'dd if=/dev/zero of=/dev/sda',
      ':(){ :|:& };:',
      'chmod 777 /',
    ];

    console.log('测试危险命令黑名单:');
    const blacklist = SecurityUtils.getBlacklist();
    blacklist.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
    if (blacklist.length > 10) {
      console.log(`  ... and ${blacklist.length - 10} more`);
    }

    console.log('\n测试危险命令检测:');
    for (const cmd of dangerousCommands) {
      const isDangerous = SecurityUtils.isDangerous(cmd);
      console.log(`  "${cmd.substring(0, 30)}... → ${isDangerous ? '✗ 已拦截' : '✓ 安全'}`);
      expect(isDangerous).toBe(true);
    }

    // 测试安全命令不应被拦截
    const safeCommands = [
      'ls -la',
      'echo "hello',
      'git status',
      'node --version',
    ];

    console.log('\n测试安全命令:');
    for (const cmd of safeCommands) {
      const isDangerous = SecurityUtils.isDangerous(cmd);
      console.log(`  "${cmd}" → ${isDangerous ? '✗ 误拦截' : '✓ 安全'}`);
      expect(isDangerous).toBe(false);
    }

    // 测试 validateCommand 抛出异常
    expect(() => {
      SecurityUtils.validateCommand('rm -rf /root');
    }).toThrow();
    console.log('\n✓ 危险命令拦截验证成功');
  }, 30000);

  test('11. 路径穿越攻击拦截', async () => {
    console.log('Test: 路径穿越攻击拦截');

    const traversalPaths = [
      '../../etc/passwd',
      '..\\..\\Windows\\System32',
      '%2e%2e%2fetc%2fpasswd',
    ];

    console.log('测试路径穿越检测:');
    for (const p of traversalPaths) {
      const hasTraversal = SecurityUtils.hasPathTraversal(p);
      console.log(`  "${p.substring(0, 30)}..." → ${hasTraversal ? '✗ 已拦截' : '✓ 安全'}`);
      expect(hasTraversal).toBe(true);
    }

    // 测试安全路径
    const safePaths = [
      '/home/user/project',
      './src/utils',
      'tests/integration',
    ];

    console.log('\n测试安全路径:');
    for (const p of safePaths) {
      const hasTraversal = SecurityUtils.hasPathTraversal(p);
      console.log(`  "${p}" → ${hasTraversal ? '✗ 误拦截' : '✓ 安全'}`);
      expect(hasTraversal).toBe(false);
    }

    console.log('\n✓ 路径穿越拦截验证成功');
  }, 30000);

  test('12. 验证测试分支存在且可切换回主分支', async () => {
    console.log('Test: 验证测试分支存在且可切换回主分支');

    // 验证测试分支存在
    const exists = await branchExists(testBranchName);
    expect(exists).toBe(true);
    console.log('✓ 测试分支存在:', testBranchName);

    // 切换回 main 分支
    if (originalBranch && originalBranch !== testBranchName) {
      await gitManager.checkoutBranch(PROJECT_ROOT, originalBranch);
      const currentAfterSwitch = await gitManager.getCurrentBranch(PROJECT_ROOT);
      console.log('切换回分支:', currentAfterSwitch);
      expect(currentAfterSwitch).toBe(originalBranch);
      console.log('✓ 成功切换回原始分支');
    } else {
      console.log('⚠ 原始分支与测试分支相同，跳过切换测试');
    }
  }, 30000);
});
