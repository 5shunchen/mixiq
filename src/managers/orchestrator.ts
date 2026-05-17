import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  Workflow,
  WorkflowStep,
  WorkflowRun,
  WorkflowStatus,
  StepExecutionResult,
  WorkflowCreateInput,
  WorkflowRunOptions,
  WorkflowExecutionContext,
  TABLE_NAMES,
  LoggerContext,
} from '../types';
import { defaultLogger as logger } from '../utils/logger';
import { validate, z } from '../utils/validator';
import { SecurityUtils } from '../utils/security';
import { db } from '../db/database';
import { defaultGitManager } from './git-manager';
import { defaultEnvManager } from './env-manager';

const execAsync = promisify(exec);

/**
 * 工作流执行错误类
 */
export class WorkflowExecutionError extends Error {
  public readonly workflowId?: string;
  public readonly runId?: string;
  public readonly stepId?: string;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    workflowId?: string,
    runId?: string,
    stepId?: string,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
    this.workflowId = workflowId;
    this.runId = runId;
    this.stepId = stepId;
    this.context = context;
    Object.setPrototypeOf(this, WorkflowExecutionError.prototype);
  }
}

/**
 * 工作流编排引擎
 * 负责管理和执行工作流，支持多种步骤类型和执行策略
 */
export class Orchestrator {
  private readonly logger = logger.createChild('orchestrator');
  private readonly runningWorkflows: Map<string, WorkflowExecutionContext> = new Map();
  private readonly builtInWorkflows: Map<string, Workflow> = new Map();

  constructor() {
    this.initializeBuiltInWorkflows();
  }

  /**
   * 初始化内置工作流模板
   */
  private initializeBuiltInWorkflows(): void {
    const builtInTemplates: WorkflowCreateInput[] = [
      this.createProjectInitWorkflow(),
      this.createFeatureBranchWorkflow(),
      this.createCodeReviewWorkflow(),
      this.createDeployEnvWorkflow(),
      this.createRollbackEnvWorkflow(),
      this.createFullCICDWorkflow(),
    ];

    for (const template of builtInTemplates) {
      const workflow: Workflow = {
        ...template,
        version: template.version || '1.0.0',
        isEnabled: true,
        id: uuidv4(),
        isBuiltIn: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.builtInWorkflows.set(workflow.name, workflow);
    }

    this.logger.info(`已初始化 ${this.builtInWorkflows.size} 个内置工作流模板`);
  }

  /**
   * 创建项目初始化工作流模板
   */
  private createProjectInitWorkflow(): WorkflowCreateInput {
    return {
      name: 'project-init',
      description: '初始化新项目，创建目录结构，初始化 Git 仓库',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        projectName: {
          type: 'string',
          required: true,
          description: '项目名称',
        },
        workspacePath: {
          type: 'string',
          required: true,
          description: '工作空间路径',
        },
        gitInit: {
          type: 'boolean',
          default: true,
          description: '是否初始化 Git 仓库',
        },
      },
      tags: ['project', 'init', 'setup'],
      steps: [
        {
          id: 'create-dir',
          name: '创建项目目录',
          type: 'shell',
          command: 'mkdir -p "${workspacePath}/${projectName}"',
          description: '创建项目根目录',
        },
        {
          id: 'git-init',
          name: '初始化 Git 仓库',
          type: 'shell',
          command: 'git init',
          targetPath: '${workspacePath}/${projectName}',
          workingDirectory: '${workspacePath}/${projectName}',
          condition: '${gitInit}',
          description: '在项目目录中初始化 Git 仓库',
        },
        {
          id: 'create-readme',
          name: '创建 README 文件',
          type: 'shell',
          command: 'echo "# ${projectName}" > "${workspacePath}/${projectName}/README.md"',
          workingDirectory: '${workspacePath}/${projectName}',
        },
      ],
    };
  }

  /**
   * 创建特性分支开发工作流模板
   */
  private createFeatureBranchWorkflow(): WorkflowCreateInput {
    return {
      name: 'feature-branch',
      description: '特性分支开发工作流：创建分支、开发、提交、推送',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        featureName: {
          type: 'string',
          required: true,
          description: '特性名称',
        },
        baseBranch: {
          type: 'string',
          default: 'main',
          description: '基础分支',
        },
        projectPath: {
          type: 'string',
          required: true,
          description: '项目路径',
        },
      },
      tags: ['git', 'feature', 'branch'],
      steps: [
        {
          id: 'checkout-base',
          name: '切换到基础分支',
          type: 'git',
          gitOperation: 'checkout',
          targetPath: '${projectPath}',
          branchName: '${baseBranch}',
        },
        {
          id: 'pull-latest',
          name: '拉取最新代码',
          type: 'git',
          gitOperation: 'pull',
          targetPath: '${projectPath}',
        },
        {
          id: 'create-branch',
          name: '创建特性分支',
          type: 'git',
          gitOperation: 'branch',
          targetPath: '${projectPath}',
          branchName: 'feature/${featureName}',
        },
        {
          id: 'checkout-feature',
          name: '切换到特性分支',
          type: 'git',
          gitOperation: 'checkout',
          targetPath: '${projectPath}',
          branchName: 'feature/${featureName}',
        },
      ],
    };
  }

  /**
   * 创建代码审查工作流模板
   */
  private createCodeReviewWorkflow(): WorkflowCreateInput {
    return {
      name: 'code-review',
      description: '代码审查工作流：运行检查、运行测试、准备审查',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        projectPath: {
          type: 'string',
          required: true,
          description: '项目路径',
        },
        lintCommand: {
          type: 'string',
          default: 'npm run lint',
          description: '代码检查命令',
        },
        testCommand: {
          type: 'string',
          default: 'npm test',
          description: '测试命令',
        },
      },
      tags: ['code-review', 'lint', 'test'],
      steps: [
        {
          id: 'run-lint',
          name: '运行代码检查',
          type: 'shell',
          command: '${lintCommand}',
          workingDirectory: '${projectPath}',
          retry: { maxAttempts: 2, delayMs: 1000 },
        },
        {
          id: 'run-tests',
          name: '运行测试',
          type: 'shell',
          command: '${testCommand}',
          workingDirectory: '${projectPath}',
          retry: { maxAttempts: 3, delayMs: 2000 },
        },
        {
          id: 'git-status',
          name: '检查 Git 状态',
          type: 'git',
          gitOperation: 'status',
          targetPath: '${projectPath}',
        },
      ],
    };
  }

  /**
   * 创建部署工作流模板
   */
  private createDeployEnvWorkflow(): WorkflowCreateInput {
    return {
      name: 'deploy-env',
      description: '部署到指定环境：构建、部署、健康检查',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: '项目 ID',
        },
        envName: {
          type: 'string',
          required: true,
          description: '环境名称',
        },
        branch: {
          type: 'string',
          default: 'main',
          description: '部署分支',
        },
      },
      tags: ['deploy', 'release', 'env'],
      steps: [
        {
          id: 'validate-env',
          name: '验证环境配置',
          type: 'tool',
          toolName: 'env.get',
          toolParams: {
            projectId: '${projectId}',
            name: '${envName}',
          },
        },
        {
          id: 'pull-code',
          name: '拉取最新代码',
          type: 'git',
          gitOperation: 'pull',
          targetPath: '${projectPath}',
        },
        {
          id: 'checkout-branch',
          name: '切换到部署分支',
          type: 'git',
          gitOperation: 'checkout',
          targetPath: '${projectPath}',
          branchName: '${branch}',
        },
        {
          id: 'run-deploy',
          name: '执行部署',
          type: 'deploy',
          environmentName: '${envName}',
        },
      ],
    };
  }

  /**
   * 创建回滚工作流模板
   */
  private createRollbackEnvWorkflow(): WorkflowCreateInput {
    return {
      name: 'rollback-env',
      description: '环境回滚工作流：回滚到上一个版本',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: '项目 ID',
        },
        envName: {
          type: 'string',
          required: true,
          description: '环境名称',
        },
        commitSha: {
          type: 'string',
          description: '回滚到指定提交（可选，默认上一个版本）',
        },
      },
      tags: ['rollback', 'deploy', 'emergency'],
      steps: [
        {
          id: 'checkout-commit',
          name: '切换到回滚提交',
          type: 'git',
          gitOperation: 'checkout',
          targetPath: '${projectPath}',
          branchName: '${commitSha}',
        },
        {
          id: 'run-deploy',
          name: '重新部署',
          type: 'deploy',
          environmentName: '${envName}',
        },
      ],
    };
  }

  /**
   * 创建完整 CI/CD 工作流模板
   */
  private createFullCICDWorkflow(): WorkflowCreateInput {
    return {
      name: 'full-cicd',
      description: '完整 CI/CD 流水线：构建、测试、代码检查、部署',
      version: '1.0.0',
      isEnabled: true,
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: '项目 ID',
        },
        envName: {
          type: 'string',
          required: true,
          description: '部署环境',
        },
        branch: {
          type: 'string',
          default: 'main',
          description: '部署分支',
        },
        runTests: {
          type: 'boolean',
          default: true,
          description: '是否运行测试',
        },
      },
      tags: ['cicd', 'full-pipeline', 'deploy'],
      steps: [
        {
          id: 'pull-latest',
          name: '拉取最新代码',
          type: 'git',
          gitOperation: 'pull',
          targetPath: '${projectPath}',
        },
        {
          id: 'install-deps',
          name: '安装依赖',
          type: 'shell',
          command: 'npm install',
          workingDirectory: '${projectPath}',
        },
        {
          id: 'run-lint',
          name: '运行代码检查',
          type: 'shell',
          command: 'npm run lint',
          workingDirectory: '${projectPath}',
        },
        {
          id: 'conditional-tests',
          name: '条件执行测试',
          type: 'condition',
          if: '${runTests}',
          then: [
            {
              id: 'run-tests',
              name: '运行测试',
              type: 'shell',
              command: 'npm test',
              workingDirectory: '${projectPath}',
              retry: { maxAttempts: 2 },
            },
          ],
        },
        {
          id: 'run-build',
          name: '构建项目',
          type: 'shell',
          command: 'npm run build',
          workingDirectory: '${projectPath}',
        },
        {
          id: 'deploy',
          name: '部署到环境',
          type: 'deploy',
          environmentName: '${envName}',
        },
      ],
    };
  }

  // ==================== 核心管理方法 ====================

  /**
   * 创建自定义工作流
   */
  public createWorkflow(
    name: string,
    definition: Omit<WorkflowCreateInput, 'name'>,
    description?: string
  ): Workflow {
    try {
      this.logger.info('创建自定义工作流', { name });

      // 验证工作流名称唯一性
      const existingBuiltIn = this.builtInWorkflows.get(name);
      if (existingBuiltIn) {
        throw new WorkflowExecutionError(
          `工作流名称 "${name}" 已被内置模板占用，请使用其他名称`,
          undefined,
          undefined,
          undefined,
          { name }
        );
      }

      // 验证工作流定义
      const validated = this.validateWorkflowDefinition({
        ...definition,
        name,
        version: definition.version || '1.0.0',
        description: description || definition.description,
      });

      // 保存到数据库
      const workflow = db.insert(TABLE_NAMES.WORKFLOWS, {
        name: validated.name,
        description: validated.description || '',
        version: validated.version || '1.0.0',
        isBuiltIn: false,
        isEnabled: validated.isEnabled !== false,
        parameters: validated.parameters || {},
        steps: validated.steps || [],
        tags: validated.tags || [],
      } as unknown as Omit<Workflow, 'id' | 'created_at' | 'updated_at'>);

      this.logger.info('工作流创建成功', { workflowId: workflow.id });
      return workflow;
    } catch (error) {
      this.logger.error('创建工作流失败', error as Error, { name });
      throw error;
    }
  }

  /**
   * 验证工作流定义
   */
  private validateWorkflowDefinition(def: WorkflowCreateInput): WorkflowCreateInput {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      version: z.string().default('1.0.0'),
      isEnabled: z.boolean().optional(),
      parameters: z.record(z.any()).optional(),
      steps: z.array(z.any()).min(1, '工作流至少需要一个步骤'),
      tags: z.array(z.string()).optional(),
    });

    return validate(schema, def, '工作流定义校验失败');
  }

  /**
   * 获取工作流定义（支持按 ID 或名称）
   */
  public getWorkflow(identifier: string): Workflow | null {
    try {
      // 先查找内置工作流
      const builtIn = this.builtInWorkflows.get(identifier);
      if (builtIn) {
        return builtIn;
      }

      // 按 ID 查找数据库中的工作流
      const byId = db.findById(TABLE_NAMES.WORKFLOWS, identifier);
      if (byId) {
        return byId;
      }

      // 按名称查找
      const allCustom = db.findAll(TABLE_NAMES.WORKFLOWS, {
        where: { name: identifier } as Partial<Record<keyof Workflow, unknown>>,
      });

      if (allCustom.length > 0) {
        return allCustom[0];
      }

      return null;
    } catch (error) {
      this.logger.error('获取工作流失败', error as Error, { identifier });
      return null;
    }
  }

  /**
   * 列出所有可用工作流（内置 + 自定义）
   */
  public listWorkflows(options?: {
    includeBuiltIn?: boolean;
    includeDisabled?: boolean;
    tag?: string;
  }): Workflow[] {
    try {
      const { includeBuiltIn = true, includeDisabled = false, tag } = options || {};

      // 获取自定义工作流
      const whereClause: Partial<Record<keyof Workflow, unknown>> = {};
      if (!includeDisabled) {
        (whereClause as Record<string, unknown>).is_enabled = 1;
      }

      const customWorkflows = db.findAll(TABLE_NAMES.WORKFLOWS, {
        where: whereClause,
        orderBy: 'created_at',
        orderDirection: 'DESC',
      });

      // 过滤标签
      let filteredCustom = customWorkflows;
      if (tag) {
        filteredCustom = customWorkflows.filter((w) => w.tags?.includes(tag));
      }

      // 合并内置工作流
      let result: Workflow[] = [...filteredCustom];

      if (includeBuiltIn) {
        let builtInList = Array.from(this.builtInWorkflows.values());
        if (!includeDisabled) {
          builtInList = builtInList.filter((w) => w.isEnabled);
        }
        if (tag) {
          builtInList = builtInList.filter((w) => w.tags?.includes(tag));
        }
        result = [...builtInList, ...result];
      }

      return result;
    } catch (error) {
      this.logger.error('列出工作流失败', error as Error);
      return [];
    }
  }

  /**
   * 删除自定义工作流
   */
  public deleteWorkflow(workflowId: string): boolean {
    try {
      const workflow = this.getWorkflow(workflowId);
      if (!workflow) {
        throw new WorkflowExecutionError(`工作流不存在: ${workflowId}`, workflowId);
      }

      if (workflow.isBuiltIn) {
        throw new WorkflowExecutionError(
          '内置工作流模板不能删除',
          workflowId,
          undefined,
          undefined,
          { name: workflow.name }
        );
      }

      const success = db.delete(TABLE_NAMES.WORKFLOWS, workflowId);
      if (success) {
        this.logger.info('工作流已删除', { workflowId, name: workflow.name });
      }

      return success;
    } catch (error) {
      this.logger.error('删除工作流失败', error as Error, { workflowId });
      throw error;
    }
  }

  // ==================== 工作流执行方法 ====================

  /**
   * 执行工作流
   */
  public async runWorkflow(
    identifier: string,
    options: WorkflowRunOptions = {}
  ): Promise<WorkflowRun> {
    const workflow = this.getWorkflow(identifier);
    if (!workflow) {
      throw new WorkflowExecutionError(
        `工作流不存在: ${identifier}`,
        identifier
      );
    }

    if (!workflow.isEnabled) {
      throw new WorkflowExecutionError(
        `工作流已被禁用: ${workflow.name}`,
        workflow.id
      );
    }

    const runId = uuidv4();
    this.logger.info('开始执行工作流', {
      runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      projectId: options.projectId,
    });

    // 验证参数
    const validatedParams = this.validateWorkflowParameters(workflow, options.parameters || {});

    // 创建执行记录
    const workflowRun: Omit<WorkflowRun, 'created_at' | 'updated_at'> = {
      id: runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      projectId: options.projectId,
      status: 'running',
      parameters: validatedParams,
      context: {},
      steps: [],
      startTime: new Date(),
    };

    // 保存到数据库
    const savedRun = db.insert(TABLE_NAMES.WORKFLOW_RUNS, workflowRun);

    // 创建执行上下文
    const executionContext: WorkflowExecutionContext = {
      runId,
      workflowId: workflow.id,
      projectId: options.projectId,
      parameters: validatedParams,
      variables: { ...validatedParams },
      startTime: new Date(),
      isCancelled: false,
      stepResults: new Map(),
    };

    this.runningWorkflows.set(runId, executionContext);

    try {
      // 执行所有步骤
      for (const step of workflow.steps) {
        if (executionContext.isCancelled) {
          this.logger.info('工作流已被取消', { runId });
          break;
        }

        const result = await this.executeStep(step, executionContext);
        savedRun.steps.push(result);

        if (result.status === 'failed' && !step.continueOnError) {
          throw new WorkflowExecutionError(
            `步骤执行失败: ${step.name}`,
            workflow.id,
            runId,
            step.id
          );
        }
      }

      // 更新执行状态
      const finalStatus: WorkflowStatus = executionContext.isCancelled ? 'cancelled' : 'completed';
      const endTime = new Date();
      const durationMs = endTime.getTime() - savedRun.startTime.getTime();

      const updatedRun = db.update(TABLE_NAMES.WORKFLOW_RUNS, runId, {
        status: finalStatus,
        steps: savedRun.steps,
        endTime,
        durationMs,
        context: executionContext.variables,
      });

      this.logger.info('工作流执行完成', {
        runId,
        status: finalStatus,
        durationMs,
      });

      return updatedRun;
    } catch (error) {
      const err = error as Error;
      const endTime = new Date();
      const durationMs = endTime.getTime() - savedRun.startTime.getTime();

      db.update(TABLE_NAMES.WORKFLOW_RUNS, runId, {
        status: 'failed',
        steps: savedRun.steps,
        error: err.message,
        errorStack: err.stack,
        endTime,
        durationMs,
        context: executionContext.variables,
      });

      this.logger.error('工作流执行失败', err, { runId });
      throw error;
    } finally {
      this.runningWorkflows.delete(runId);
    }
  }

  /**
   * 验证工作流参数
   */
  private validateWorkflowParameters(
    workflow: Workflow,
    parameters: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, paramDef] of Object.entries(workflow.parameters || {})) {
      const value = parameters[key];

      if (paramDef.required && (value === undefined || value === null)) {
        if (paramDef.default !== undefined) {
          result[key] = paramDef.default;
        } else {
          throw new WorkflowExecutionError(
            `缺少必需参数: ${key}`,
            workflow.id
          );
        }
      } else if (value !== undefined) {
        result[key] = value;
      } else if (paramDef.default !== undefined) {
        result[key] = paramDef.default;
      }
    }

    return result;
  }

  /**
   * 获取工作流执行记录
   */
  public getWorkflowRun(runId: string): WorkflowRun | null {
    try {
      return db.findById(TABLE_NAMES.WORKFLOW_RUNS, runId);
    } catch (error) {
      this.logger.error('获取工作流执行记录失败', error as Error, { runId });
      return null;
    }
  }

  /**
   * 列出工作流执行历史
   */
  public listWorkflowRuns(options?: {
    projectId?: string;
    workflowId?: string;
    status?: WorkflowStatus;
    limit?: number;
    offset?: number;
  }): WorkflowRun[] {
    try {
      const { projectId, workflowId, status, limit = 50, offset = 0 } = options || {};

      const whereClause: Partial<Record<keyof WorkflowRun, unknown>> = {};
      if (projectId) {
        (whereClause as Record<string, unknown>).project_id = projectId;
      }
      if (workflowId) {
        (whereClause as Record<string, unknown>).workflow_id = workflowId;
      }
      if (status) {
        (whereClause as Record<string, unknown>).status = status;
      }

      return db.findAll(TABLE_NAMES.WORKFLOW_RUNS, {
        where: whereClause,
        orderBy: 'startTime',
        orderDirection: 'DESC',
        limit,
        offset,
      });
    } catch (error) {
      this.logger.error('列出工作流执行历史失败', error as Error);
      return [];
    }
  }

  /**
   * 取消正在执行的工作流
   */
  public cancelWorkflowRun(runId: string, cancelledBy?: string): boolean {
    try {
      const context = this.runningWorkflows.get(runId);
      if (!context) {
        // 尝试更新数据库中的状态
        const run = this.getWorkflowRun(runId);
        if (!run) {
          throw new WorkflowExecutionError(`工作流执行不存在: ${runId}`, undefined, runId);
        }
        if (run.status !== 'running' && run.status !== 'pending') {
          throw new WorkflowExecutionError(
            `工作流 ${runId} 当前状态 ${run.status} 无法取消`,
            undefined,
            runId
          );
        }
      } else {
        context.isCancelled = true;
      }

      db.update(TABLE_NAMES.WORKFLOW_RUNS, runId, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
      });

      this.logger.info('工作流已取消', { runId, cancelledBy });
      return true;
    } catch (error) {
      this.logger.error('取消工作流失败', error as Error, { runId });
      throw error;
    }
  }

  // ==================== 步骤执行引擎 ====================

  /**
   * 执行单个步骤
   */
  public async executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.debug('开始执行步骤', {
      runId: context.runId,
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
    });

    const result: StepExecutionResult = {
      stepId: step.id,
      stepName: step.name,
      status: 'running',
      startTime,
      attempt: 0,
    };

    // 检查步骤条件
    if (step.condition) {
      const conditionMet = this.evaluateCondition(step.condition, context);
      if (!conditionMet) {
        result.status = 'completed';
        result.endTime = new Date();
        result.durationMs = 0;
        result.output = '步骤条件不满足，已跳过';
        this.logger.debug('步骤条件不满足，已跳过', { stepId: step.id });
        return result;
      }
    }

    const maxAttempts = step.retry?.maxAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (context.isCancelled) {
        result.status = 'cancelled';
        break;
      }

      result.attempt = attempt;
      try {
        const output = await this.executeStepByType(step, context);
        result.status = 'completed';
        result.output = output;

        // 保存输出变量
        if (step.outputVar) {
          context.variables[step.outputVar] = output;
        }

        break;
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`步骤执行失败，尝试 ${attempt}/${maxAttempts}`, {
          stepId: step.id,
          error: err.message,
        });

        if (attempt === maxAttempts) {
          result.status = 'failed';
          result.error = err.message;
          result.errorStack = err.stack;
        } else if (step.retry?.delayMs) {
          const delay = step.retry.delayMs * Math.pow(step.retry.backoffMultiplier || 1, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    result.endTime = new Date();
    result.durationMs = result.endTime.getTime() - startTime.getTime();
    result.contextSnapshot = { ...context.variables };

    context.stepResults.set(step.id, result);

    // 更新数据库中的执行记录
    try {
      const currentRun = this.getWorkflowRun(context.runId);
      if (currentRun) {
        const allResults = Array.from(context.stepResults.values());
        db.update(TABLE_NAMES.WORKFLOW_RUNS, context.runId, {
          steps: allResults,
          context: context.variables,
        });
      }
    } catch (updateError) {
      this.logger.warn('更新步骤执行结果失败', {
        runId: context.runId,
        stepId: step.id,
        error: (updateError as Error).message,
      });
    }

    this.logger.debug('步骤执行完成', {
      stepId: step.id,
      status: result.status,
      durationMs: result.durationMs,
    });

    return result;
  }

  /**
   * 根据步骤类型执行具体逻辑
   */
  private async executeStepByType(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    // 替换变量
    const resolvedStep = this.resolveStepVariables(step, context);

    // 超时控制
    const timeout = step.timeout || 300000; // 默认 5 分钟超时

    return Promise.race([
      this.executeStepTypeInternal(resolvedStep, context),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`步骤执行超时: ${step.name} (${timeout}ms)`)),
          timeout
        )
      ),
    ]);
  }

  /**
   * 执行具体步骤类型的内部实现
   */
  private async executeStepTypeInternal(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    switch (step.type) {
      case 'shell':
        return this.executeShellStep(step, context);
      case 'git':
        return this.executeGitStep(step, context);
      case 'deploy':
        return this.executeDeployStep(step, context);
      case 'tool':
        return this.executeToolStep(step, context);
      case 'condition':
        return this.executeConditionStep(step, context);
      case 'parallel':
        return this.executeParallelStep(step, context);
      case 'loop':
        return this.executeLoopStep(step, context);
      case 'wait':
        return this.executeWaitStep(step);
      default:
        throw new WorkflowExecutionError(
          `不支持的步骤类型: ${step.type}`,
          context.workflowId,
          context.runId,
          step.id
        );
    }
  }

  /**
   * 替换步骤中的变量
   */
  private resolveStepVariables<T>(obj: T, context: WorkflowExecutionContext): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.replaceVariables(obj, context.variables) as unknown as T;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveStepVariables(item, context)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = this.resolveStepVariables(value, context);
      }
      return result as T;
    }

    return obj;
  }

  /**
   * 替换字符串中的变量占位符
   */
  private replaceVariables(str: string, variables: Record<string, unknown>): string {
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = variables[varName.trim()];
      if (value === undefined) {
        this.logger.warn('变量未定义，使用原始值', { varName });
        return match;
      }
      return String(value);
    });
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(condition: string, context: WorkflowExecutionContext): boolean {
    try {
      // 简单的布尔值检查
      const trimmed = condition.trim();
      if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
        const varName = trimmed.slice(2, -1).trim();
        const value = context.variables[varName];
        return Boolean(value);
      }

      // 尝试作为 JavaScript 表达式求值（简化版）
      let expr = condition;
      for (const [key, value] of Object.entries(context.variables)) {
        expr = expr.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), JSON.stringify(value));
      }

      // 使用 Function 安全求值（只允许简单的比较表达式）
      if (/^[\s\w\W]*$/.test(expr)) {
        // 安全检查：只允许比较运算符和逻辑运算符
        return new Function(`return ${expr}`)();
      }

      return Boolean(expr);
    } catch (error) {
      this.logger.warn('条件表达式求值失败，默认视为不满足', {
        condition,
        error: (error as Error).message,
      });
      return false;
    }
  }

  // ==================== 各类型步骤执行 ====================

  /**
   * 执行 Shell 命令步骤
   */
  private async executeShellStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!step.command) {
      throw new WorkflowExecutionError(
        'Shell 步骤缺少命令配置',
        context.workflowId,
        context.runId,
        step.id
      );
    }

    // 安全检查
    SecurityUtils.validateCommand(step.command);

    const cwd = step.workingDirectory;
    if (cwd) {
      SecurityUtils.validatePath(cwd);
    }

    // 远程执行（需要服务器配置对象，当前简化为本地执行）
    if (step.remoteServer) {
      // 注意：这里需要实际的 ServerConfig 对象，当前实现暂时使用本地执行
      this.logger.warn('远程 SSH 执行需要完整的服务器配置，使用本地执行替代', {
        remoteServer: step.remoteServer,
      });
    }

    // 本地执行
    const fullCommand = step.args
      ? `${step.command} ${step.args.join(' ')}`
      : step.command;

    this.logger.debug('执行 Shell 命令', {
      command: SecurityUtils.redact(fullCommand),
      cwd,
      runId: context.runId,
    });

    const result = await execAsync(fullCommand, { cwd });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  }

  /**
   * 执行 Git 操作步骤
   */
  private async executeGitStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    const targetPath = step.targetPath;
    if (!targetPath) {
      throw new WorkflowExecutionError(
        'Git 步骤缺少目标路径配置',
        context.workflowId,
        context.runId,
        step.id
      );
    }

    SecurityUtils.validatePath(targetPath);

    switch (step.gitOperation) {
      case 'clone':
        if (!step.repoUrl) {
          throw new Error('Git clone 操作需要仓库 URL');
        }
        return defaultGitManager.cloneRepo(step.repoUrl, targetPath);

      case 'commit':
        return defaultGitManager.commit(targetPath, step.commitMessage || 'Auto commit');

      case 'push':
        return defaultGitManager.push(
          targetPath,
          step.remoteName || 'origin',
          step.branchName
        );

      case 'pull':
        return defaultGitManager.pull(
          targetPath,
          step.remoteName || 'origin',
          step.branchName
        );

      case 'branch':
        if (!step.branchName) {
          throw new Error('Git branch 操作需要分支名称');
        }
        return defaultGitManager.createBranch(targetPath, step.branchName);

      case 'checkout':
        if (!step.branchName) {
          throw new Error('Git checkout 操作需要分支名称');
        }
        return defaultGitManager.checkoutBranch(targetPath, step.branchName);

      case 'status':
        return defaultGitManager.getStatus(targetPath);

      case 'log':
        return defaultGitManager.getCommitHistory(targetPath, 10);

      default:
        throw new WorkflowExecutionError(
          `不支持的 Git 操作: ${step.gitOperation}`,
          context.workflowId,
          context.runId,
          step.id
        );
    }
  }

  /**
   * 执行部署步骤
   */
  private async executeDeployStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    if (!step.environmentName || !context.projectId) {
      throw new WorkflowExecutionError(
        'Deploy 步骤需要环境名称和项目 ID',
        context.workflowId,
        context.runId,
        step.id
      );
    }

    return defaultEnvManager.deploy(
      context.projectId,
      step.environmentName,
      step.branchName || 'main',
      {
        buildCommand: step.buildCommand,
        skipBuild: step.skipBuild,
      }
    );
  }

  /**
   * 执行工具调用步骤（占位实现）
   */
  private async executeToolStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    this.logger.debug('执行工具调用', {
      toolName: step.toolName,
      toolParams: step.toolParams,
      runId: context.runId,
    });

    // 这里预留 MCP 工具调用接口
    return {
      toolName: step.toolName,
      params: step.toolParams,
      executed: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 执行条件判断步骤
   */
  private async executeConditionStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<{ conditionMet: boolean; executedSteps: StepExecutionResult[] }> {
    const conditionMet = step.if ? this.evaluateCondition(step.if, context) : false;

    const executedSteps: StepExecutionResult[] = [];

    if (conditionMet && step.then) {
      for (const subStep of step.then) {
        if (context.isCancelled) break;
        const result = await this.executeStep(subStep, context);
        executedSteps.push(result);
        if (result.status === 'failed' && !subStep.continueOnError) {
          throw new WorkflowExecutionError(
            `条件分支步骤执行失败: ${subStep.name}`,
            context.workflowId,
            context.runId,
            subStep.id
          );
        }
      }
    } else if (!conditionMet && step.else) {
      for (const subStep of step.else) {
        if (context.isCancelled) break;
        const result = await this.executeStep(subStep, context);
        executedSteps.push(result);
        if (result.status === 'failed' && !subStep.continueOnError) {
          throw new WorkflowExecutionError(
            `Else 分支步骤执行失败: ${subStep.name}`,
            context.workflowId,
            context.runId,
            subStep.id
          );
        }
      }
    }

    return { conditionMet, executedSteps };
  }

  /**
   * 执行并行步骤
   */
  private async executeParallelStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepExecutionResult[]> {
    if (!step.parallel || step.parallel.length === 0) {
      return [];
    }

    const maxConcurrency = step.maxConcurrency || step.parallel.length;
    const results: StepExecutionResult[] = [];

    for (let i = 0; i < step.parallel.length; i += maxConcurrency) {
      if (context.isCancelled) break;

      const batch = step.parallel.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map((subStep) => this.executeStep(subStep, context))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * 执行循环步骤
   */
  private async executeLoopStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepExecutionResult[]> {
    if (!step.do || step.do.length === 0) {
      return [];
    }

    const results: StepExecutionResult[] = [];
    const iteratorVar = step.iteratorVar || 'item';

    if (step.loopType === 'for') {
      const items = step.items || [];
      for (let i = 0; i < items.length; i++) {
        if (context.isCancelled) break;

        context.variables[iteratorVar] = items[i];
        context.variables['index'] = i;

        for (const subStep of step.do) {
          if (context.isCancelled) break;
          const result = await this.executeStep(subStep, context);
          results.push(result);
          if (result.status === 'failed' && !subStep.continueOnError) {
            throw new WorkflowExecutionError(
              `循环步骤执行失败: ${subStep.name}`,
              context.workflowId,
              context.runId,
              subStep.id
            );
          }
        }
      }
    } else if (step.loopType === 'while') {
      let iteration = 0;
      const maxIterations = step.iterations || 100;

      while (
        step.whileCondition
          ? this.evaluateCondition(step.whileCondition, context)
          : iteration < maxIterations
      ) {
        if (context.isCancelled) break;
        if (iteration >= maxIterations) {
          this.logger.warn('达到最大循环次数，退出循环', { maxIterations });
          break;
        }

        context.variables['iteration'] = iteration;

        for (const subStep of step.do) {
          if (context.isCancelled) break;
          const result = await this.executeStep(subStep, context);
          results.push(result);
          if (result.status === 'failed' && !subStep.continueOnError) {
            throw new WorkflowExecutionError(
              `循环步骤执行失败: ${subStep.name}`,
              context.workflowId,
              context.runId,
              subStep.id
            );
          }
        }

        iteration++;
      }
    }

    return results;
  }

  /**
   * 执行等待步骤
   */
  private async executeWaitStep(step: WorkflowStep): Promise<{ waitedMs: number }> {
    const waitMs = step.waitMs || 1000;

    if (step.waitUntil) {
      const targetTime = new Date(step.waitUntil).getTime();
      const now = Date.now();
      if (targetTime > now) {
        const actualWait = targetTime - now;
        await new Promise((resolve) => setTimeout(resolve, actualWait));
        return { waitedMs: actualWait };
      }
      return { waitedMs: 0 };
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return { waitedMs: waitMs };
  }

  /**
   * 获取正在运行的工作流
   */
  public getRunningWorkflows(): string[] {
    return Array.from(this.runningWorkflows.keys());
  }
}

/**
 * 默认单例实例
 */
export const defaultOrchestrator = new Orchestrator();

export default Orchestrator;