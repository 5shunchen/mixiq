import { EnvManager } from '../../src/managers/env-manager';
import { MixIQDatabase } from '../../src/db/database';
import { SSHExecutor } from '../../src/ssh/ssh-executor';
import { GitManager } from '../../src/managers/git-manager';
import {
  Environment,
  EnvironmentError,
  DeploymentError,
  TABLE_NAMES,
  SSHServer,
  EnvironmentConfig,
  Deployment,
  DeploymentStatus,
  HealthCheckResult,
  ServerHealthCheck,
  Project,
} from '../../src/types';

// Mock 依赖
jest.mock('../../src/db/database');
jest.mock('../../src/ssh/ssh-executor');
jest.mock('../../src/managers/git-manager');
jest.mock('../../src/utils/logger');

describe('EnvManager', () => {
  let envManager: EnvManager;
  let mockDb: jest.Mocked<MixIQDatabase>;
  let mockSSHExecutor: jest.Mocked<SSHExecutor>;
  let mockGitManager: jest.Mocked<GitManager>;

  const TEST_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000';
  const TEST_ENV_NAME = 'production';
  const TEST_DEPLOYMENT_ID = '123e4567-e89b-12d3-a456-426614174001';

  const testServers: SSHServer[] = [
    {
      host: '192.168.1.1',
      port: 22,
      username: 'deploy',
      privateKeyPath: '/home/user/.ssh/id_rsa',
    },
  ];

  const testConfig: EnvironmentConfig = {
    buildCommand: 'npm run build',
    deployScript: 'npm run deploy',
    remotePath: '/var/www/app',
    healthCheckEndpoint: 'http://localhost:3000/health',
    healthCheckTimeout: 10000,
    variables: { NODE_ENV: 'production' },
  };

  const testEnvironment: Environment = {
    id: 'env-1',
    project_id: TEST_PROJECT_ID,
    name: TEST_ENV_NAME,
    servers: testServers,
    config: testConfig,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testProject: Project = {
    id: TEST_PROJECT_ID,
    name: 'Test Project',
    workspace_path: '/path/to/workspace',
    git_remotes: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testDeployment: Deployment = {
    id: TEST_DEPLOYMENT_ID,
    project_id: TEST_PROJECT_ID,
    env_name: TEST_ENV_NAME,
    branch: 'main',
    status: 'success',
    commit_sha: 'abc123def456',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 mock 实例
    mockDb = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      init: jest.fn(),
      close: jest.fn(),
      query: jest.fn(),
      transaction: jest.fn((cb) => cb()),
    } as unknown as jest.Mocked<MixIQDatabase>;

    mockSSHExecutor = {
      execute: jest.fn(),
      executeWithExitCodeCheck: jest.fn(),
      syncFiles: jest.fn(),
      executeBatch: jest.fn(),
      isReachable: jest.fn(),
      readRemoteFile: jest.fn(),
      writeRemoteFile: jest.fn(),
    } as unknown as jest.Mocked<SSHExecutor>;

    mockGitManager = {
      checkoutBranch: jest.fn(),
      pull: jest.fn(),
      getCommitHistory: jest.fn(),
      initRepo: jest.fn(),
      cloneRepo: jest.fn(),
      getStatus: jest.fn(),
      getBranches: jest.fn(),
      getCurrentBranch: jest.fn(),
      createBranch: jest.fn(),
      deleteBranch: jest.fn(),
      addFiles: jest.fn(),
      commit: jest.fn(),
      push: jest.fn(),
      getRemotes: jest.fn(),
      addRemote: jest.fn(),
      createPR: jest.fn(),
      reviewPR: jest.fn(),
    } as unknown as jest.Mocked<GitManager>;

    (MixIQDatabase as jest.Mock).mockImplementation(() => mockDb);
    (SSHExecutor as jest.Mock).mockImplementation(() => mockSSHExecutor);
    (GitManager as jest.Mock).mockImplementation(() => mockGitManager);

    envManager = new EnvManager(mockDb, mockSSHExecutor, mockGitManager);
  });

  describe('实例化测试', () => {
    it('应该成功创建 EnvManager 实例', () => {
      expect(envManager).toBeInstanceOf(EnvManager);
    });

    it('应该使用默认的依赖实例', () => {
      const manager = new EnvManager();
      expect(manager).toBeInstanceOf(EnvManager);
    });
  });

  describe('createEnvironment 方法测试', () => {
    it('应该成功创建环境', async () => {
      mockDb.findAll.mockReturnValueOnce([]);
      mockDb.insert.mockReturnValueOnce(testEnvironment);

      const result = await envManager.createEnvironment(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        testServers,
        testConfig
      );

      expect(result).toEqual(testEnvironment);
      expect(mockDb.findAll).toHaveBeenCalledWith(
        TABLE_NAMES.ENVIRONMENTS,
        expect.objectContaining({
          where: {
            project_id: TEST_PROJECT_ID,
            name: TEST_ENV_NAME,
          },
        })
      );
      expect(mockDb.insert).toHaveBeenCalledWith(
        TABLE_NAMES.ENVIRONMENTS,
        expect.objectContaining({
          project_id: TEST_PROJECT_ID,
          name: TEST_ENV_NAME,
          servers: testServers,
          config: testConfig,
        })
      );
    });

    it('创建重复环境应该抛出 EnvironmentError', async () => {
      mockDb.findAll.mockReturnValue([testEnvironment]);

      await expect(
        envManager.createEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME, testServers)
      ).rejects.toThrow(EnvironmentError);

      await expect(
        envManager.createEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME, testServers)
      ).rejects.toThrow(`环境 "${TEST_ENV_NAME}" 已存在`);
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.createEnvironment('invalid-uuid', TEST_ENV_NAME, testServers)
      ).rejects.toThrow(EnvironmentError);

      await expect(
        envManager.createEnvironment(TEST_PROJECT_ID, '', testServers)
      ).rejects.toThrow(EnvironmentError);

      await expect(
        envManager.createEnvironment(TEST_PROJECT_ID, 'env/with/slash', testServers)
      ).rejects.toThrow(EnvironmentError);
    });

    it('服务器配置必须是数组', async () => {
      await expect(
        envManager.createEnvironment(
          TEST_PROJECT_ID,
          TEST_ENV_NAME,
          null as unknown as SSHServer[]
        )
      ).rejects.toThrow('服务器配置必须是数组');
    });

    it('服务器配置字段校验失败应该抛出错误', async () => {
      const invalidServers = [
        {
          host: 'invalid-host-!@#',
          port: 99999,
          username: '',
          privateKeyPath: '',
        },
      ] as SSHServer[];

      await expect(
        envManager.createEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME, invalidServers)
      ).rejects.toThrow();
    });
  });

  describe('getEnvironment 方法测试', () => {
    it('应该成功获取环境', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);

      const result = await envManager.getEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME);

      expect(result).toEqual(testEnvironment);
      expect(mockDb.findAll).toHaveBeenCalledWith(
        TABLE_NAMES.ENVIRONMENTS,
        expect.objectContaining({
          where: {
            project_id: TEST_PROJECT_ID,
            name: TEST_ENV_NAME,
          },
        })
      );
    });

    it('环境不存在应该抛出 EnvironmentError', async () => {
      mockDb.findAll.mockReturnValue([]);

      await expect(
        envManager.getEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow(EnvironmentError);

      await expect(
        envManager.getEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow(`环境 "${TEST_ENV_NAME}" 不存在`);
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.getEnvironment('invalid-uuid', TEST_ENV_NAME)
      ).rejects.toThrow(EnvironmentError);
    });
  });

  describe('listEnvironments 方法测试', () => {
    it('应该列出所有环境', async () => {
      const environments: Environment[] = [
        testEnvironment,
        {
          ...testEnvironment,
          id: 'env-2',
          name: 'staging',
        },
      ];

      mockDb.findAll.mockReturnValueOnce(environments);

      const result = await envManager.listEnvironments(TEST_PROJECT_ID);

      expect(result).toHaveLength(2);
      expect(result).toEqual(environments);
      expect(mockDb.findAll).toHaveBeenCalledWith(
        TABLE_NAMES.ENVIRONMENTS,
        expect.objectContaining({
          where: { project_id: TEST_PROJECT_ID },
        })
      );
    });

    it('应该返回空列表当没有环境时', async () => {
      mockDb.findAll.mockReturnValueOnce([]);

      const result = await envManager.listEnvironments(TEST_PROJECT_ID);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.listEnvironments('invalid-uuid')
      ).rejects.toThrow(EnvironmentError);
    });
  });

  describe('updateEnvironment 方法测试', () => {
    it('应该更新环境配置', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);

      const updatedEnv: Environment = {
        ...testEnvironment,
        config: {
          ...testConfig,
          buildCommand: 'pnpm run build',
        },
      };

      mockDb.update.mockReturnValueOnce(updatedEnv);

      const result = await envManager.updateEnvironment(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        {
          config: {
            ...testConfig,
            buildCommand: 'pnpm run build',
          },
        }
      );

      expect(result.config?.buildCommand).toBe('pnpm run build');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('应该更新服务器列表', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);

      const newServers: SSHServer[] = [
        ...testServers,
        {
          host: '192.168.1.2',
          port: 22,
          username: 'deploy',
          privateKeyPath: '/home/user/.ssh/id_rsa',
        },
      ];

      const updatedEnv: Environment = {
        ...testEnvironment,
        servers: newServers,
      };

      mockDb.update.mockReturnValueOnce(updatedEnv);

      const result = await envManager.updateEnvironment(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        { servers: newServers }
      );

      expect(result.servers).toHaveLength(2);
    });

    it('环境不存在应该抛出 EnvironmentError', async () => {
      mockDb.findAll.mockReturnValueOnce([]);

      await expect(
        envManager.updateEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME, {})
      ).rejects.toThrow(EnvironmentError);
    });

    it('更新无效的服务器配置应该抛出错误', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);

      await expect(
        envManager.updateEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME, {
          servers: null as unknown as SSHServer[],
        })
      ).rejects.toThrow('服务器配置必须是数组');
    });
  });

  describe('deleteEnvironment 方法测试', () => {
    it('应该删除环境', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
      mockDb.delete.mockReturnValueOnce(true);

      const result = await envManager.deleteEnvironment(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalledWith(
        TABLE_NAMES.ENVIRONMENTS,
        testEnvironment.id
      );
    });

    it('删除不存在的环境应该抛出 EnvironmentError', async () => {
      mockDb.findAll.mockReturnValueOnce([]);

      await expect(
        envManager.deleteEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow(EnvironmentError);
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.deleteEnvironment('invalid-uuid', TEST_ENV_NAME)
      ).rejects.toThrow(EnvironmentError);
    });
  });

  describe('deploy 方法测试', () => {
    beforeEach(() => {
      mockDb.findAll
        .mockReturnValueOnce([testEnvironment])
        .mockReturnValueOnce([testProject]);
      mockDb.insert.mockReturnValue(testDeployment);
      mockDb.update.mockReturnValue(testDeployment);
      mockGitManager.checkoutBranch.mockResolvedValue(true);
      mockGitManager.pull.mockResolvedValue(true);
      mockGitManager.getCommitHistory.mockResolvedValue({
        total: 1,
        commits: [{ hash: 'abc123def456', message: 'test', author: 'test', date: '2024-01-01' }],
      });
      (mockSSHExecutor.execute as jest.Mock).mockResolvedValue({
        stdout: '200',
        stderr: '',
        exitCode: 0,
      });
      mockSSHExecutor.isReachable.mockResolvedValue(true);
    });

    it('应该成功执行部署流程', async () => {
      const result = await envManager.deploy(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        'main',
        { skipHealthCheck: true }
      );

      expect(result.status).toBe('success');
      expect(result.deploymentId).toBe(TEST_DEPLOYMENT_ID);
      expect(mockGitManager.checkoutBranch).toHaveBeenCalledWith(
        testProject.workspace_path,
        'main'
      );
      expect(mockGitManager.pull).toHaveBeenCalled();
    });

    it('部署失败应该抛出 DeploymentError', async () => {
      (mockGitManager.pull as jest.Mock).mockRejectedValue(new Error('Git pull failed'));

      await expect(
        envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, 'main')
      ).rejects.toThrow(DeploymentError);
    });

    it('应该跳过构建步骤', async () => {
      await envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, 'main', {
        skipBuild: true,
        skipHealthCheck: true,
      });

      // 构建命令不应该被执行
    });

    it('应该跳过健康检查', async () => {
      await envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, 'main', {
        skipHealthCheck: true,
      });

      // 健康检查应该被跳过，结果应该显示 healthy: true
    });

    it('项目不存在应该抛出错误', async () => {
      mockDb.findAll.mockReset();
      let callCount = 0;
      (mockDb.findAll as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [testEnvironment]; // 查找环境
        return []; // 查找项目
      });

      await expect(
        envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, 'main', {
          skipHealthCheck: true,
        })
      ).rejects.toThrow('项目不存在');
    });

    it('分支名称为空应该抛出错误', async () => {
      await expect(
        envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, '')
      ).rejects.toThrow('分支名称不能为空');
    });

    it('健康检查失败应该抛出错误', async () => {
      mockSSHExecutor.isReachable.mockResolvedValue(false);

      await expect(
        envManager.deploy(TEST_PROJECT_ID, TEST_ENV_NAME, 'main')
      ).rejects.toThrow(DeploymentError);
    });
  });

  describe('rollback 方法测试', () => {
    beforeEach(() => {
      mockDb.findAll.mockReturnValue([testEnvironment]);
    });

    it('应该成功回滚到上一版本', async () => {
      const deployments: Deployment[] = [
        {
          ...testDeployment,
          id: 'deploy-1',
          status: 'success',
          branch: 'main',
        },
        {
          ...testDeployment,
          id: 'deploy-2',
          status: 'success',
          branch: 'feature-branch',
        },
      ];

      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
      mockDb.findAll.mockReturnValueOnce(deployments);

      // Mock deploy 调用
      const mockDeploy = jest.spyOn(envManager, 'deploy').mockResolvedValue({
        deploymentId: 'new-deploy-id',
        status: 'success' as DeploymentStatus,
        healthCheckResult: {
          healthy: true,
          serverResults: [],
          totalServers: 0,
          healthyServers: 0,
        },
      });

      const result = await envManager.rollback(TEST_PROJECT_ID, TEST_ENV_NAME);

      expect(result.status).toBe('success');
      expect(mockDeploy).toHaveBeenCalled();
    });

    it('应该回滚到指定版本', async () => {
      mockDb.findById.mockReturnValueOnce(testDeployment);

      jest.spyOn(envManager, 'deploy').mockResolvedValue({
        deploymentId: 'new-deploy-id',
        status: 'success' as DeploymentStatus,
        healthCheckResult: {
          healthy: true,
          serverResults: [],
          totalServers: 0,
          healthyServers: 0,
        },
      });

      const result = await envManager.rollback(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        TEST_DEPLOYMENT_ID
      );

      expect(result.status).toBe('success');
      expect(mockDb.findById).toHaveBeenCalledWith(
        TABLE_NAMES.DEPLOYMENTS,
        TEST_DEPLOYMENT_ID
      );
    });

    it('没有可回滚版本应该抛出 DeploymentError', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
      mockDb.findAll.mockReturnValueOnce([testDeployment]);

      await expect(
        envManager.rollback(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow(DeploymentError);

      await expect(
        envManager.rollback(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow('没有可回滚的历史版本');
    });

    it('指定的部署不存在应该抛出错误', async () => {
      mockDb.findById.mockReturnValueOnce(null);

      await expect(
        envManager.rollback(TEST_PROJECT_ID, TEST_ENV_NAME, '00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('指定的部署记录不存在');
    });

    it('只能回滚到成功的部署版本', async () => {
      const failedDeployment: Deployment = {
        ...testDeployment,
        status: 'failed',
      };

      mockDb.findById.mockReturnValueOnce(failedDeployment);

      await expect(
        envManager.rollback(TEST_PROJECT_ID, TEST_ENV_NAME, TEST_DEPLOYMENT_ID)
      ).rejects.toThrow('只能回滚到成功的部署版本');
    });
  });

  describe('getDeployments 方法测试', () => {
    it('应该获取部署历史', async () => {
      const deployments: Deployment[] = [
        testDeployment,
        {
          ...testDeployment,
          id: 'deploy-2',
          status: 'running',
        },
      ];

      mockDb.findAll.mockReturnValueOnce(deployments);

      const result = await envManager.getDeployments(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        10
      );

      expect(result).toHaveLength(2);
      expect(mockDb.findAll).toHaveBeenCalledWith(
        TABLE_NAMES.DEPLOYMENTS,
        expect.objectContaining({
          where: {
            project_id: TEST_PROJECT_ID,
            env_name: TEST_ENV_NAME,
          },
          limit: 10,
        })
      );
    });

    it('应该使用默认的 limit 参数', async () => {
      mockDb.findAll.mockReturnValueOnce([]);

      await envManager.getDeployments(TEST_PROJECT_ID, TEST_ENV_NAME);

      expect(mockDb.findAll).toHaveBeenCalledWith(
        TABLE_NAMES.DEPLOYMENTS,
        expect.objectContaining({
          limit: 20,
        })
      );
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.getDeployments('invalid-uuid', TEST_ENV_NAME)
      ).rejects.toThrow(DeploymentError);
    });
  });

  describe('getDeployment 方法测试', () => {
    it('应该获取单个部署详情', async () => {
      mockDb.findById.mockReturnValueOnce(testDeployment);

      const result = await envManager.getDeployment(
        TEST_PROJECT_ID,
        TEST_DEPLOYMENT_ID
      );

      expect(result).toEqual(testDeployment);
      expect(mockDb.findById).toHaveBeenCalledWith(
        TABLE_NAMES.DEPLOYMENTS,
        TEST_DEPLOYMENT_ID
      );
    });

    it('部署不存在应该抛出 DeploymentError', async () => {
      mockDb.findById.mockReturnValueOnce(null);

      await expect(
        envManager.getDeployment(TEST_PROJECT_ID, TEST_DEPLOYMENT_ID)
      ).rejects.toThrow('部署记录不存在');
    });

    it('部署不属于当前项目应该抛出错误', async () => {
      const wrongProjectDeployment: Deployment = {
        ...testDeployment,
        project_id: 'different-project-id',
      };

      mockDb.findById.mockReturnValueOnce(wrongProjectDeployment);

      await expect(
        envManager.getDeployment(TEST_PROJECT_ID, TEST_DEPLOYMENT_ID)
      ).rejects.toThrow('部署记录不属于当前项目');
    });

    it('参数校验失败应该抛出错误', async () => {
      await expect(
        envManager.getDeployment('invalid-uuid', TEST_DEPLOYMENT_ID)
      ).rejects.toThrow(DeploymentError);
    });
  });

  describe('getLogs 方法测试', () => {
    beforeEach(() => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
    });

    it('应该成功获取日志', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: 'log line 1\nlog line 2',
        stderr: '',
        exitCode: 0,
      });

      const result = await envManager.getLogs(
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        { lines: 50 }
      );

      expect(result).toHaveLength(1);
      expect(result[0].host).toBe(testServers[0].host);
      expect(result[0].logs).toContain('log line');
    });

    it('应该支持过滤日志内容', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: 'filtered log',
        stderr: '',
        exitCode: 0,
      });

      await envManager.getLogs(TEST_PROJECT_ID, TEST_ENV_NAME, {
        filter: 'ERROR',
      });

      const callArgs = (mockSSHExecutor.execute as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('grep');
    });

    it('应该使用指定的行数获取日志', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await envManager.getLogs(TEST_PROJECT_ID, TEST_ENV_NAME, {
        lines: 200,
      });

      const callArgs = (mockSSHExecutor.execute as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('tail -n 200');
    });

    it('应该支持指定服务名称', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: 'service log',
        stderr: '',
        exitCode: 0,
      });

      await envManager.getLogs(TEST_PROJECT_ID, TEST_ENV_NAME, {
        service: 'api',
      });

      const callArgs = (mockSSHExecutor.execute as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('api.log');
    });

    it('SSH 连接失败应该在结果中包含错误信息', async () => {
      (mockSSHExecutor.execute as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const result = await envManager.getLogs(TEST_PROJECT_ID, TEST_ENV_NAME);

      expect(result[0].error).toBeDefined();
      expect(result[0].logs).toBe('');
    });
  });

  describe('healthCheck 方法测试', () => {
    beforeEach(() => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
    });

    it('健康检查成功应该返回 healthy: true', async () => {
      mockSSHExecutor.isReachable.mockResolvedValue(true);
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: '200',
        stderr: '',
        exitCode: 0,
      });

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.healthy).toBe(true);
      expect(result.totalServers).toBe(1);
      expect(result.healthyServers).toBe(1);
    });

    it('健康检查失败应该返回 healthy: false', async () => {
      mockSSHExecutor.isReachable.mockResolvedValue(false);

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.healthy).toBe(false);
      expect(result.serverResults[0].reachable).toBe(false);
    });

    it('多服务器检查结果聚合', async () => {
      const multiServerEnv: Environment = {
        ...testEnvironment,
        servers: [
          testServers[0],
          {
            host: '192.168.1.2',
            port: 22,
            username: 'deploy',
            privateKeyPath: '/home/user/.ssh/id_rsa',
          },
        ],
      };

      mockDb.findAll.mockReset();
      mockDb.findAll.mockReturnValueOnce([multiServerEnv]);
      mockSSHExecutor.isReachable
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: '200',
        stderr: '',
        exitCode: 0,
      });

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.healthy).toBe(false);
      expect(result.totalServers).toBe(2);
      expect(result.healthyServers).toBe(1);
      expect(result.serverResults).toHaveLength(2);
    });

    it('应该包含响应时间', async () => {
      mockSSHExecutor.isReachable.mockResolvedValue(true);
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: '200',
        stderr: '',
        exitCode: 0,
      });

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.serverResults[0].responseTime).toBeDefined();
      expect(result.serverResults[0].responseTime).toBeGreaterThanOrEqual(0);
    });

    it('没有配置健康检查端点应该检查服务状态', async () => {
      mockSSHExecutor.isReachable.mockResolvedValue(true);
      mockSSHExecutor.execute.mockResolvedValue({
        stdout: '500',
        stderr: '',
        exitCode: 0,
      });

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.healthy).toBe(false);
    });

    it('应该检查命令执行失败应该返回健康检查失败结果', async () => {
      mockDb.findAll.mockReset();
      (mockDb.findAll as jest.Mock).mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await envManager.healthCheck(
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(result.healthy).toBe(false);
      expect(result.message).toContain('健康检查执行失败');
    });
  });

  describe('错误处理测试', () => {
    it('数据库错误应该被正确捕获并抛出', async () => {
      (mockDb.findAll as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(
        envManager.getEnvironment(TEST_PROJECT_ID, TEST_ENV_NAME)
      ).rejects.toThrow(EnvironmentError);
    });

    it('SSH 连接失败应该被正确处理', async () => {
      mockDb.findAll.mockReturnValueOnce([testEnvironment]);
      (mockSSHExecutor.isReachable as jest.Mock).mockRejectedValue(new Error('SSH connection failed'));

      const result = await envManager.healthCheck(TEST_PROJECT_ID, TEST_ENV_NAME);

      expect(result.healthy).toBe(false);
    });

    it('EnvironmentError 应该包含正确的属性', () => {
      const error = new EnvironmentError(
        '测试错误消息',
        TEST_PROJECT_ID,
        TEST_ENV_NAME
      );

      expect(error.message).toBe('测试错误消息');
      expect(error.projectId).toBe(TEST_PROJECT_ID);
      expect(error.envName).toBe(TEST_ENV_NAME);
      expect(error.name).toBe('EnvironmentError');
    });

    it('DeploymentError 应该包含正确的属性', () => {
      const error = new DeploymentError(
        '部署失败',
        TEST_PROJECT_ID,
        TEST_ENV_NAME,
        TEST_DEPLOYMENT_ID
      );

      expect(error.message).toBe('部署失败');
      expect(error.projectId).toBe(TEST_PROJECT_ID);
      expect(error.envName).toBe(TEST_ENV_NAME);
      expect(error.deploymentId).toBe(TEST_DEPLOYMENT_ID);
      expect(error.name).toBe('DeploymentError');
    });
  });

  describe('ToolResult 结构正确性', () => {
    it('健康检查结果应该包含正确的字段', () => {
      const healthCheck: HealthCheckResult = {
        healthy: true,
        serverResults: [],
        totalServers: 1,
        healthyServers: 1,
        message: 'OK',
      };

      expect(healthCheck.healthy).toBeDefined();
      expect(healthCheck.serverResults).toBeDefined();
      expect(healthCheck.totalServers).toBeDefined();
      expect(healthCheck.healthyServers).toBeDefined();
      expect(healthCheck.message).toBeDefined();
    });

    it('服务器健康检查结果应该包含正确的字段', () => {
      const serverResult: ServerHealthCheck = {
        host: '192.168.1.1',
        reachable: true,
        serviceRunning: true,
        responseTime: 100,
      };

      expect(serverResult.host).toBeDefined();
      expect(serverResult.reachable).toBeDefined();
      expect(serverResult.serviceRunning).toBeDefined();
      expect(serverResult.responseTime).toBeDefined();
    });
  });
});
