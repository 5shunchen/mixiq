import {
  Environment,
  EnvironmentConfig,
  Deployment,
  DeploymentResult,
  DeployOptions,
  HealthCheckResult,
  ServerHealthCheck,
  LogQueryOptions,
  SSHServer,
  ServerConfig,
  TABLE_NAMES,
  EnvironmentError,
  DeploymentError,
  WithoutTimestampsAndId,
  UpdateInput,
} from '../types';
import { Logger } from '../utils/logger';
import { validateUUID, z } from '../utils/validator';
import { SecurityUtils } from '../utils/security';
import { SSHExecutor } from '../ssh/ssh-executor';
import { MixIQDatabase, db } from '../db/database';
import { GitManager } from './git-manager';

const logger = new Logger('env-manager');

/**
 * 环境名称校验 Schema
 */
const EnvironmentNameSchema = z
  .string({
    required_error: '环境名称不能为空',
    invalid_type_error: '环境名称必须是字符串类型',
  })
  .min(1, '环境名称长度不能小于 1')
  .max(100, '环境名称长度不能大于 100')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    '环境名称只能包含字母、数字、下划线和连字符'
  );

/**
 * 服务器配置校验 Schema
 */
const SSHServerSchema: z.ZodSchema<SSHServer> = z.object({
  host: z
    .string({
      required_error: '主机地址不能为空',
    })
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-._]*[a-zA-Z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/,
      '主机地址格式不正确'
    ),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  privateKeyPath: z.string().min(1),
});

/**
 * 环境配置校验 Schema
 */
const EnvironmentConfigSchema: z.ZodSchema<EnvironmentConfig | undefined> = z
  .object({
    buildCommand: z.string().optional(),
    deployScript: z.string().optional(),
    remotePath: z.string().optional(),
    healthCheckEndpoint: z.string().optional(),
    healthCheckTimeout: z.number().int().min(1000).max(300000).optional(),
    variables: z.record(z.string()).optional(),
  })
  .optional();

/**
 * 环境管理器
 * 负责环境的创建、配置管理、部署、回滚等操作
 */
export class EnvManager {
  private readonly db: MixIQDatabase;
  private readonly sshExecutor: SSHExecutor;
  private readonly gitManager: GitManager;

  constructor(
    dbInstance: MixIQDatabase = db,
    sshExecutor?: SSHExecutor,
    gitManager?: GitManager
  ) {
    this.db = dbInstance;
    this.sshExecutor = sshExecutor || new SSHExecutor();
    this.gitManager = gitManager || new GitManager();
  }

  // ========================================================================
  // 核心方法：环境 CRUD
  // ========================================================================

  /**
   * 创建新环境
   * @param projectId 项目 ID
   * @param name 环境名称
   * @param servers 服务器列表
   * @param config 环境配置
   * @returns 创建的环境
   * @throws EnvironmentError 创建失败时抛出
   */
  public async createEnvironment(
    projectId: string,
    name: string,
    servers: SSHServer[],
    config?: EnvironmentConfig
  ): Promise<Environment> {
    try {
      logger.info('开始创建环境', { projectId, name });

      // 参数校验
      validateUUID(projectId);
      EnvironmentNameSchema.parse(name);

      // 校验服务器配置
      if (!Array.isArray(servers)) {
        throw new EnvironmentError(
          '服务器配置必须是数组',
          projectId,
          name
        );
      }

      for (const server of servers) {
        SSHServerSchema.parse(server);
        SecurityUtils.validatePath(server.privateKeyPath);
      }

      // 校验配置
      if (config) {
        EnvironmentConfigSchema.parse(config);
        if (config.remotePath) {
          SecurityUtils.validatePath(config.remotePath);
        }
      }

      // 检查同名环境是否已存在
      const existingEnvs = this.db.findAll(TABLE_NAMES.ENVIRONMENTS, {
        where: {
          project_id: projectId,
          name,
        } as Partial<Environment>,
        limit: 1,
      });

      if (existingEnvs.length > 0) {
        throw new EnvironmentError(
          `环境 "${name}" 已存在`,
          projectId,
          name
        );
      }

      // 创建环境
      const envData: WithoutTimestampsAndId<Environment> = {
        project_id: projectId,
        name,
        servers,
        config,
      };

      const env = this.db.insert(TABLE_NAMES.ENVIRONMENTS, envData);

      logger.info('环境创建成功', {
        projectId,
        envName: name,
        envId: env.id,
        serverCount: servers.length,
      });

      return env;
    } catch (error) {
      if (error instanceof EnvironmentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('创建环境失败', error instanceof Error ? error : undefined, {
        projectId,
        name,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `创建环境失败: ${errorMessage}`,
        projectId,
        name
      );
    }
  }

  /**
   * 获取单个环境信息
   * @param projectId 项目 ID
   * @param name 环境名称
   * @returns 环境信息
   * @throws EnvironmentError 环境不存在时抛出
   */
  public async getEnvironment(
    projectId: string,
    name: string
  ): Promise<Environment> {
    try {
      validateUUID(projectId);
      EnvironmentNameSchema.parse(name);

      const envs = this.db.findAll(TABLE_NAMES.ENVIRONMENTS, {
        where: {
          project_id: projectId,
          name,
        } as Partial<Environment>,
        limit: 1,
      });

      if (envs.length === 0) {
        throw new EnvironmentError(
          `环境 "${name}" 不存在`,
          projectId,
          name
        );
      }

      return envs[0];
    } catch (error) {
      if (error instanceof EnvironmentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('获取环境信息失败', error instanceof Error ? error : undefined, {
        projectId,
        name,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `获取环境信息失败: ${errorMessage}`,
        projectId,
        name
      );
    }
  }

  /**
   * 列出项目的所有环境
   * @param projectId 项目 ID
   * @returns 环境列表
   */
  public async listEnvironments(projectId: string): Promise<Environment[]> {
    try {
      validateUUID(projectId);

      const envs = this.db.findAll(TABLE_NAMES.ENVIRONMENTS, {
        where: {
          project_id: projectId,
        } as Partial<Environment>,
        orderBy: 'created_at',
        orderDirection: 'DESC',
      });

      logger.debug('获取环境列表成功', {
        projectId,
        count: envs.length,
      });

      return envs;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('获取环境列表失败', error instanceof Error ? error : undefined, {
        projectId,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `获取环境列表失败: ${errorMessage}`,
        projectId
      );
    }
  }

  /**
   * 更新环境配置
   * @param projectId 项目 ID
   * @param name 环境名称
   * @param updates 更新内容
   * @returns 更新后的环境
   * @throws EnvironmentError 环境不存在时抛出
   */
  public async updateEnvironment(
    projectId: string,
    name: string,
    updates: UpdateInput<Environment>
  ): Promise<Environment> {
    try {
      logger.info('开始更新环境配置', { projectId, name });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(name);

      const env = await this.getEnvironment(projectId, name);

      // 校验更新内容
      if (updates.servers !== undefined) {
        if (!Array.isArray(updates.servers)) {
          throw new EnvironmentError(
            '服务器配置必须是数组',
            projectId,
            name
          );
        }
        for (const server of updates.servers) {
          SSHServerSchema.parse(server);
          SecurityUtils.validatePath(server.privateKeyPath);
        }
      }

      if (updates.config !== undefined && updates.config !== null) {
        EnvironmentConfigSchema.parse(updates.config);
        if (updates.config.remotePath) {
          SecurityUtils.validatePath(updates.config.remotePath);
        }
      }

      // 执行更新
      const updatedEnv = this.db.update(
        TABLE_NAMES.ENVIRONMENTS,
        env.id,
        updates
      );

      logger.info('环境配置更新成功', {
        projectId,
        envName: name,
        updatedFields: Object.keys(updates),
      });

      return updatedEnv;
    } catch (error) {
      if (error instanceof EnvironmentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('更新环境配置失败', error instanceof Error ? error : undefined, {
        projectId,
        name,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `更新环境配置失败: ${errorMessage}`,
        projectId,
        name
      );
    }
  }

  /**
   * 删除环境
   * @param projectId 项目 ID
   * @param name 环境名称
   * @returns 是否删除成功
   * @throws EnvironmentError 环境不存在时抛出
   */
  public async deleteEnvironment(
    projectId: string,
    name: string
  ): Promise<boolean> {
    try {
      logger.warn('开始删除环境', { projectId, name });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(name);

      const env = await this.getEnvironment(projectId, name);

      const success = this.db.delete(TABLE_NAMES.ENVIRONMENTS, env.id);

      if (success) {
        logger.warn('环境删除成功', { projectId, envName: name, envId: env.id });
      }

      return success;
    } catch (error) {
      if (error instanceof EnvironmentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('删除环境失败', error instanceof Error ? error : undefined, {
        projectId,
        name,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `删除环境失败: ${errorMessage}`,
        projectId,
        name
      );
    }
  }

  // ========================================================================
  // 部署相关方法
  // ========================================================================

  /**
   * 执行部署操作
   * @param projectId 项目 ID
   * @param envName 环境名称
   * @param branch 要部署的分支
   * @param options 部署选项
   * @returns 部署结果
   * @throws DeploymentError 部署失败时抛出
   */
  public async deploy(
    projectId: string,
    envName: string,
    branch: string,
    options: DeployOptions = {}
  ): Promise<DeploymentResult> {
    const startTime = Date.now();
    let deploymentId: string | undefined;

    try {
      logger.info('开始执行部署', {
        projectId,
        envName,
        branch,
        skipBuild: options.skipBuild,
        skipHealthCheck: options.skipHealthCheck,
      });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(envName);

      if (!branch || typeof branch !== 'string') {
        throw new DeploymentError(
          '分支名称不能为空',
          projectId,
          envName
        );
      }

      // 获取环境配置
      const env = await this.getEnvironment(projectId, envName);

      // 1. 获取项目信息（需要 workspacePath）
      const projects = this.db.findAll(TABLE_NAMES.PROJECTS, {
        where: { id: projectId } as Partial<{ id: string }>,
        limit: 1,
      });

      if (projects.length === 0) {
        throw new DeploymentError(
          '项目不存在',
          projectId,
          envName
        );
      }

      const project = projects[0];

      // 2. 创建部署记录
      const deployment = this.db.insert(TABLE_NAMES.DEPLOYMENTS, {
        project_id: projectId,
        env_name: envName,
        branch,
        status: 'running',
        commit_sha: '',
      } as WithoutTimestampsAndId<Deployment>);

      deploymentId = deployment.id;

      logger.info('部署记录已创建', { deploymentId });

      // 3. 拉取最新代码并获取 commit SHA
      logger.info('正在拉取最新代码', { workspacePath: project.workspace_path });

      try {
        await this.gitManager.checkoutBranch(project.workspace_path, branch);
        await this.gitManager.pull(project.workspace_path, branch);
      } catch (gitError) {
        const errorMsg = gitError instanceof Error ? gitError.message : String(gitError);
        throw new DeploymentError(
          `Git 操作失败: ${errorMsg}`,
          projectId,
          envName,
          deploymentId
        );
      }

      // 获取最新的 commit SHA
      const commitHistory = await this.gitManager.getCommitHistory(project.workspace_path, 1);
      const commitSha = commitHistory.commits[0]?.hash || '';

      // 更新部署记录的 commit_sha
      this.db.update(TABLE_NAMES.DEPLOYMENTS, deploymentId, {
        commit_sha: commitSha,
      });

      let deploymentOutput = `Commit: ${commitSha}\n`;

      // 4. 执行构建命令（如果需要）
      if (!options.skipBuild) {
        const buildCommand = options.buildCommand || env.config?.buildCommand;

        if (buildCommand) {
          logger.info('正在执行构建命令', { command: buildCommand });

          try {
            SecurityUtils.validateCommand(buildCommand);
            deploymentOutput += `执行构建: ${buildCommand}\n`;

            // 在项目工作目录执行构建命令
            for (const server of env.servers) {
              const serverConfig: ServerConfig = {
                id: server.host,
                name: server.host,
                host: server.host,
                port: server.port,
                username: server.username,
                privateKey: server.privateKeyPath,
              };

              try {
                const result = await this.sshExecutor.execute(
                  serverConfig,
                  buildCommand,
                  env.config?.remotePath,
                  options.timeout || 300000
                );
                deploymentOutput += `服务器 ${server.host} 构建输出: ${result.stdout}\n`;

                if (result.exitCode !== 0) {
                  throw new Error(`构建失败: ${result.stderr}`);
                }
              } catch (sshError) {
                const errorMsg = sshError instanceof Error ? sshError.message : String(sshError);
                throw new DeploymentError(
                  `服务器 ${server.host} 构建失败: ${errorMsg}`,
                  projectId,
                  envName,
                  deploymentId
                );
              }
            }
          } catch (buildError) {
            if (buildError instanceof DeploymentError) {
              throw buildError;
            }
            const errorMsg = buildError instanceof Error ? buildError.message : String(buildError);
            throw new DeploymentError(
              `构建失败: ${errorMsg}`,
              projectId,
              envName,
              deploymentId
            );
          }
        }
      }

      // 5. 执行部署脚本
      const deployScript = options.deployScript || env.config?.deployScript;

      if (deployScript) {
        logger.info('正在执行部署脚本', { script: deployScript });

        try {
          SecurityUtils.validateCommand(deployScript);
          deploymentOutput += `执行部署脚本: ${deployScript}\n`;

          for (const server of env.servers) {
            const serverConfig: ServerConfig = {
              id: server.host,
              name: server.host,
              host: server.host,
              port: server.port,
              username: server.username,
              privateKey: server.privateKeyPath,
            };

            try {
              const result = await this.sshExecutor.execute(
                serverConfig,
                deployScript,
                env.config?.remotePath,
                options.timeout || 300000
              );
              deploymentOutput += `服务器 ${server.host} 部署输出: ${result.stdout}\n`;

              if (result.exitCode !== 0) {
                throw new Error(`部署脚本执行失败: ${result.stderr}`);
              }
            } catch (sshError) {
              const errorMsg = sshError instanceof Error ? sshError.message : String(sshError);
              throw new DeploymentError(
                `服务器 ${server.host} 部署失败: ${errorMsg}`,
                projectId,
                envName,
                deploymentId
              );
            }
          }
        } catch (deployError) {
          if (deployError instanceof DeploymentError) {
            throw deployError;
          }
          const errorMsg = deployError instanceof Error ? deployError.message : String(deployError);
          throw new DeploymentError(
            `部署脚本执行失败: ${errorMsg}`,
            projectId,
            envName,
            deploymentId
          );
        }
      }

      // 6. 执行健康检查
      let healthCheckResult: HealthCheckResult = {
        healthy: true,
        serverResults: [],
        totalServers: env.servers.length,
        healthyServers: env.servers.length,
        message: '健康检查跳过',
      };

      if (!options.skipHealthCheck) {
        logger.info('正在执行健康检查');
        healthCheckResult = await this.healthCheck(projectId, envName);
        deploymentOutput += `健康检查结果: ${healthCheckResult.healthy ? '通过' : '失败'}\n`;

        if (!healthCheckResult.healthy) {
          throw new DeploymentError(
            '健康检查失败',
            projectId,
            envName,
            deploymentId
          );
        }
      }

      // 7. 更新部署状态为成功
      this.db.update(TABLE_NAMES.DEPLOYMENTS, deploymentId, {
        status: 'success',
        output: deploymentOutput,
      });

      const duration = Date.now() - startTime;

      logger.info('部署成功完成', {
        deploymentId,
        projectId,
        envName,
        branch,
        commitSha,
        durationMs: duration,
      });

      return {
        deploymentId,
        status: 'success',
        healthCheckResult,
        output: deploymentOutput,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 更新部署状态为失败
      if (deploymentId) {
        try {
          this.db.update(TABLE_NAMES.DEPLOYMENTS, deploymentId, {
            status: 'failed',
            error: errorMessage,
          });
        } catch {
          // 忽略更新状态失败的错误
        }
      }

      logger.error('部署失败', error instanceof Error ? error : undefined, {
        deploymentId,
        projectId,
        envName,
        branch,
        error: errorMessage,
      });

      if (error instanceof DeploymentError) {
        throw error;
      }

      throw new DeploymentError(
        `部署失败: ${errorMessage}`,
        projectId,
        envName,
        deploymentId
      );
    }
  }

  /**
   * 回滚到上一个版本或指定部署版本
   * @param projectId 项目 ID
   * @param envName 环境名称
   * @param targetDeploymentId 目标部署 ID（可选，不传则回滚到上一个成功版本）
   * @returns 回滚结果
   * @throws DeploymentError 回滚失败时抛出
   */
  public async rollback(
    projectId: string,
    envName: string,
    targetDeploymentId?: string
  ): Promise<DeploymentResult> {
    try {
      logger.info('开始执行回滚', {
        projectId,
        envName,
        targetDeploymentId,
      });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(envName);

      // 验证环境存在
      await this.getEnvironment(projectId, envName);

      // 查找要回滚到的目标版本
      let targetDeployment: Deployment | undefined;

      if (targetDeploymentId) {
        validateUUID(targetDeploymentId);
        const deployment = this.db.findById(TABLE_NAMES.DEPLOYMENTS, targetDeploymentId);

        if (!deployment) {
          throw new DeploymentError(
            '指定的部署记录不存在',
            projectId,
            envName,
            targetDeploymentId
          );
        }

        if (deployment.status !== 'success') {
          throw new DeploymentError(
            '只能回滚到成功的部署版本',
            projectId,
            envName,
            targetDeploymentId
          );
        }

        targetDeployment = deployment as Deployment;
      } else {
        // 查找上一个成功的部署
        const deployments = this.db.findAll(TABLE_NAMES.DEPLOYMENTS, {
          where: {
            project_id: projectId,
            env_name: envName,
            status: 'success',
          } as Partial<Deployment>,
          orderBy: 'created_at',
          orderDirection: 'DESC',
          limit: 2,
        });

        if (deployments.length < 2) {
          throw new DeploymentError(
            '没有可回滚的历史版本',
            projectId,
            envName
          );
        }

        // 取上一个成功版本（跳过最新的）
        targetDeployment = deployments[1] as Deployment;
      }

      logger.info('回滚目标版本已确定', {
        targetDeploymentId: targetDeployment.id,
        branch: targetDeployment.branch,
        commitSha: targetDeployment.commit_sha,
      });

      // 执行回滚部署
      const result = await this.deploy(
        projectId,
        envName,
        targetDeployment.branch,
        {
          skipBuild: true,
          skipHealthCheck: false,
        }
      );

      // 将回滚前的版本标记为已回滚
      const recentDeployments = await this.getDeployments(projectId, envName, 2);
      if (recentDeployments.length > 1) {
        this.db.update(TABLE_NAMES.DEPLOYMENTS, recentDeployments[1].id, {
          status: 'rolled_back',
        });
      }

      logger.info('回滚成功完成', {
        deploymentId: result.deploymentId,
        targetDeploymentId: targetDeployment.id,
      });

      return result;
    } catch (error) {
      if (error instanceof DeploymentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('回滚失败', error instanceof Error ? error : undefined, {
        projectId,
        envName,
        targetDeploymentId,
        error: errorMessage,
      });

      throw new DeploymentError(
        `回滚失败: ${errorMessage}`,
        projectId,
        envName
      );
    }
  }

  /**
   * 获取部署历史
   * @param projectId 项目 ID
   * @param envName 环境名称
   * @param limit 返回记录数量限制
   * @returns 部署记录列表
   */
  public async getDeployments(
    projectId: string,
    envName: string,
    limit = 20
  ): Promise<Deployment[]> {
    try {
      validateUUID(projectId);
      EnvironmentNameSchema.parse(envName);

      const deployments = this.db.findAll(TABLE_NAMES.DEPLOYMENTS, {
        where: {
          project_id: projectId,
          env_name: envName,
        } as Partial<Deployment>,
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit,
      });

      logger.debug('获取部署历史成功', {
        projectId,
        envName,
        count: deployments.length,
      });

      return deployments;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('获取部署历史失败', error instanceof Error ? error : undefined, {
        projectId,
        envName,
        error: errorMessage,
      });

      throw new DeploymentError(
        `获取部署历史失败: ${errorMessage}`,
        projectId,
        envName
      );
    }
  }

  /**
   * 获取单个部署详情
   * @param projectId 项目 ID
   * @param deploymentId 部署 ID
   * @returns 部署详情
   * @throws DeploymentError 部署不存在时抛出
   */
  public async getDeployment(
    projectId: string,
    deploymentId: string
  ): Promise<Deployment> {
    try {
      validateUUID(projectId);
      validateUUID(deploymentId);

      const deployment = this.db.findById(TABLE_NAMES.DEPLOYMENTS, deploymentId);

      if (!deployment) {
        throw new DeploymentError(
          '部署记录不存在',
          projectId,
          undefined,
          deploymentId
        );
      }

      if (deployment.project_id !== projectId) {
        throw new DeploymentError(
          '部署记录不属于当前项目',
          projectId,
          undefined,
          deploymentId
        );
      }

      return deployment as Deployment;
    } catch (error) {
      if (error instanceof DeploymentError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('获取部署详情失败', error instanceof Error ? error : undefined, {
        projectId,
        deploymentId,
        error: errorMessage,
      });

      throw new DeploymentError(
        `获取部署详情失败: ${errorMessage}`,
        projectId,
        undefined,
        deploymentId
      );
    }
  }

  // ========================================================================
  // 日志和健康检查
  // ========================================================================

  /**
   * 获取远程服务器日志
   * @param projectId 项目 ID
   * @param envName 环境名称
   * @param options 日志查询选项
   * @returns 各服务器的日志内容
   */
  public async getLogs(
    projectId: string,
    envName: string,
    options: LogQueryOptions = {}
  ): Promise<Array<{ host: string; logs: string; error?: string }>> {
    try {
      logger.info('开始获取服务器日志', {
        projectId,
        envName,
        service: options.service,
        lines: options.lines,
      });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(envName);

      const env = await this.getEnvironment(projectId, envName);
      const lines = options.lines || 100;

      const results: Array<{ host: string; logs: string; error?: string }> = [];

      // 构建日志查询命令
      let logCommand = `tail -n ${lines}`;
      if (options.filter) {
        logCommand += ` | grep '${options.filter.replace(/'/g, "'\\''")}'`;
      }

      // 如果指定了服务，假设日志路径
      if (options.service) {
        const logPath = env.config?.remotePath
          ? `${env.config.remotePath}/logs/${options.service}.log`
          : `/var/log/${options.service}.log`;
        logCommand = `tail -n ${lines} ${logPath}`;
      }

      for (const server of env.servers) {
        const serverConfig: ServerConfig = {
          id: server.host,
          name: server.host,
          host: server.host,
          port: server.port,
          username: server.username,
          privateKey: server.privateKeyPath,
        };

        try {
          const result = await this.sshExecutor.execute(
            serverConfig,
            logCommand,
            undefined,
            30000
          );

          results.push({
            host: server.host,
            logs: result.stdout || result.stderr,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({
            host: server.host,
            logs: '',
            error: errorMsg,
          });
        }
      }

      logger.debug('日志获取完成', {
        serverCount: results.length,
        successCount: results.filter((r) => !r.error).length,
      });

      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('获取日志失败', error instanceof Error ? error : undefined, {
        projectId,
        envName,
        error: errorMessage,
      });

      throw new EnvironmentError(
        `获取日志失败: ${errorMessage}`,
        projectId,
        envName
      );
    }
  }

  /**
   * 执行环境健康检查
   * @param projectId 项目 ID
   * @param envName 环境名称
   * @returns 健康检查结果
   */
  public async healthCheck(
    projectId: string,
    envName: string
  ): Promise<HealthCheckResult> {
    try {
      logger.info('开始执行健康检查', { projectId, envName });

      validateUUID(projectId);
      EnvironmentNameSchema.parse(envName);

      const env = await this.getEnvironment(projectId, envName);
      const serverResults: ServerHealthCheck[] = [];

      for (const server of env.servers) {
        const serverStartTime = Date.now();
        const serverConfig: ServerConfig = {
          id: server.host,
          name: server.host,
          host: server.host,
          port: server.port,
          username: server.username,
          privateKey: server.privateKeyPath,
        };

        try {
          // 1. 检查服务器连通性
          const isReachable = await this.sshExecutor.isReachable(serverConfig);

          if (!isReachable) {
            serverResults.push({
              host: server.host,
              reachable: false,
              error: '服务器不可达',
              responseTime: Date.now() - serverStartTime,
            });
            continue;
          }

          // 2. 检查服务运行状态（如果配置了健康检查端点）
          let serviceRunning = true;
          if (env.config?.healthCheckEndpoint) {
            try {
              const healthCheckCmd = env.config.healthCheckEndpoint.startsWith('http')
                ? `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 ${env.config.healthCheckEndpoint}`
                : env.config.healthCheckEndpoint;

              const result = await this.sshExecutor.execute(
                serverConfig,
                healthCheckCmd,
                env.config.remotePath,
                env.config.healthCheckTimeout || 30000
              );

              // 如果是 HTTP 检查，检查状态码是否为 200-399
              if (env.config.healthCheckEndpoint.startsWith('http')) {
                const statusCode = parseInt(result.stdout.trim(), 10);
                serviceRunning = statusCode >= 200 && statusCode < 400;
              } else {
                serviceRunning = result.exitCode === 0;
              }
            } catch {
              serviceRunning = false;
            }
          }

          serverResults.push({
            host: server.host,
            reachable: true,
            serviceRunning,
            responseTime: Date.now() - serverStartTime,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          serverResults.push({
            host: server.host,
            reachable: false,
            error: errorMsg,
            responseTime: Date.now() - serverStartTime,
          });
        }
      }

      const healthyServers = serverResults.filter(
        (r) => r.reachable && (r.serviceRunning === undefined || r.serviceRunning)
      ).length;

      const healthy = healthyServers === serverResults.length;

      const result: HealthCheckResult = {
        healthy,
        serverResults,
        totalServers: serverResults.length,
        healthyServers,
        message: healthy
          ? '所有服务器健康检查通过'
          : `${serverResults.length - healthyServers} 台服务器健康检查失败`,
      };

      logger.info('健康检查完成', {
        projectId,
        envName,
        healthy,
        totalServers: result.totalServers,
        healthyServers: result.healthyServers,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('健康检查失败', error instanceof Error ? error : undefined, {
        projectId,
        envName,
        error: errorMessage,
      });

      // 返回失败的健康检查结果而不是抛出异常
      return {
        healthy: false,
        serverResults: [],
        totalServers: 0,
        healthyServers: 0,
        message: `健康检查执行失败: ${errorMessage}`,
      };
    }
  }
}

/**
 * 默认单例实例
 */
export const defaultEnvManager = new EnvManager();

export default EnvManager;
