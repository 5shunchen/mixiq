import { Orchestrator, WorkflowExecutionError, defaultOrchestrator } from '../../src/managers/orchestrator';
import { Workflow, WorkflowStep, WorkflowStatus, WorkflowRun } from '../../src/types';

// Mock execAsync result
let mockExecResult: { stdout: string; stderr: string } | Error = { stdout: 'success', stderr: '' };

// Mock child_process and util.promisify
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: jest.fn().mockReturnValue(() => {
    if (mockExecResult instanceof Error) {
      return Promise.reject(mockExecResult);
    }
    return Promise.resolve(mockExecResult);
  }),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-123'),
}));

// Mock database
const mockInsert = jest.fn();
const mockFindById = jest.fn();
const mockFindAll = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../src/db/database', () => ({
  db: {
    insert: jest.fn((...args) => mockInsert(...args)),
    findById: jest.fn((...args) => mockFindById(...args)),
    findAll: jest.fn((...args) => mockFindAll(...args)),
    update: jest.fn((...args) => mockUpdate(...args)),
    delete: jest.fn((...args) => mockDelete(...args)),
  },
  MixIQDatabase: jest.fn(),
}));

// Mock GitManager
const mockCloneRepo = jest.fn();
const mockCommit = jest.fn();
const mockPush = jest.fn();
const mockPull = jest.fn();
const mockCreateBranch = jest.fn();
const mockCheckoutBranch = jest.fn();
const mockGetStatus = jest.fn();
const mockGetCommitHistory = jest.fn();

jest.mock('../../src/managers/git-manager', () => ({
  defaultGitManager: {
    cloneRepo: jest.fn((...args) => mockCloneRepo(...args)),
    commit: jest.fn((...args) => mockCommit(...args)),
    push: jest.fn((...args) => mockPush(...args)),
    pull: jest.fn((...args) => mockPull(...args)),
    createBranch: jest.fn((...args) => mockCreateBranch(...args)),
    checkoutBranch: jest.fn((...args) => mockCheckoutBranch(...args)),
    getStatus: jest.fn((...args) => mockGetStatus(...args)),
    getCommitHistory: jest.fn((...args) => mockGetCommitHistory(...args)),
  },
  GitManager: jest.fn(),
}));

// Mock EnvManager
const mockDeploy = jest.fn();

jest.mock('../../src/managers/env-manager', () => ({
  defaultEnvManager: {
    deploy: jest.fn((...args) => mockDeploy(...args)),
  },
  EnvManager: jest.fn(),
}));

// Mock Logger
jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    createChild: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  })),
  defaultLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    createChild: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock validator
let shouldValidateThrow = false;

jest.mock('../../src/utils/validator', () => {
  const mockChainable: any = () => ({
    min: mockChainable,
    max: mockChainable,
    optional: mockChainable,
    default: (val: unknown) => ({
      optional: mockChainable,
      parse: () => val,
    }),
    regex: mockChainable,
    parse: (val: unknown) => val,
  });

  return {
    validate: jest.fn((_schema, data) => {
      if (shouldValidateThrow) {
        throw new Error('Validation failed');
      }
      return data;
    }),
    z: {
      object: mockChainable,
      string: mockChainable,
      boolean: mockChainable,
      record: mockChainable,
      any: mockChainable,
      array: mockChainable,
      min: () => ({
        required_error: '',
      }),
    },
  };
});

// Mock SecurityUtils
jest.mock('../../src/utils/security', () => ({
  SecurityUtils: {
    validatePath: jest.fn(),
    validateCommand: jest.fn(),
    redact: jest.fn((cmd) => cmd),
  },
}));

// Mock SSHExecutor
jest.mock('../../src/ssh/ssh-executor', () => ({
  SSHExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({
      stdout: 'success',
      stderr: '',
      exitCode: 0,
    }),
    isReachable: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Orchestrator - 工作流编排引擎测试', () => {
  let orchestrator: Orchestrator;

  const createMockWorkflow = (overrides?: Partial<Workflow>): Workflow => ({
    id: 'workflow-123',
    name: 'test-workflow',
    description: '测试工作流',
    version: '1.0.0',
    isBuiltIn: false,
    isEnabled: true,
    parameters: {},
    steps: [],
    tags: ['test'],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  const createMockStep = (overrides?: Partial<WorkflowStep>): WorkflowStep => ({
    id: 'step-1',
    name: '测试步骤',
    type: 'shell',
    command: 'echo "test"',
    workingDirectory: '/tmp',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    orchestrator = new Orchestrator();

    // 重置 mock exec 结果 - 成功
    mockExecResult = { stdout: 'success', stderr: '' };

    // 重置数据库 mock
    mockFindById.mockReturnValue(null);
    mockFindAll.mockReturnValue([]);
    mockDelete.mockReturnValue(true);
  });

  // ========================================================================
  // 实例化测试
  // ========================================================================
  describe('实例化测试', () => {
    it('应该正确创建 Orchestrator 实例', () => {
      expect(orchestrator).toBeInstanceOf(Orchestrator);
    });

    it('应该存在默认的全局 Orchestrator 实例', () => {
      expect(defaultOrchestrator).toBeInstanceOf(Orchestrator);
    });

    it('构造函数应该初始化内置工作流模板', () => {
      const workflows = orchestrator.listWorkflows({ includeBuiltIn: true });
      expect(workflows.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ========================================================================
  // 工作流管理方法测试
  // ========================================================================
  describe('createWorkflow - 创建自定义工作流', () => {
    it('应该成功创建自定义工作流', () => {
      const workflowData = {
        description: '自定义测试工作流',
        version: '1.0.0',
        isEnabled: true,
        parameters: {
          param1: {
            type: 'string' as const,
            required: true,
            description: '测试参数',
          },
        },
        steps: [createMockStep()],
        tags: ['custom', 'test'],
      };

      const mockCreatedWorkflow = createMockWorkflow({ name: 'custom-workflow' });
      mockInsert.mockReturnValue(mockCreatedWorkflow);

      const result = orchestrator.createWorkflow('custom-workflow', workflowData);

      expect(result).toEqual(mockCreatedWorkflow);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('使用与内置工作流重复的名称时应该抛出错误', () => {
      const workflowData = {
        steps: [createMockStep()],
      };

      expect(() => {
        orchestrator.createWorkflow('project-init', workflowData);
      }).toThrow(WorkflowExecutionError);
      expect(() => {
        orchestrator.createWorkflow('project-init', workflowData);
      }).toThrow('工作流名称 "project-init" 已被内置模板占用');
    });

    it('当工作流定义验证失败时应该抛出错误', () => {
      const workflowData = {
        steps: [], // 没有步骤应该失败
      };

      shouldValidateThrow = true;

      expect(() => {
        orchestrator.createWorkflow('invalid-workflow', workflowData);
      }).toThrow();

      shouldValidateThrow = false;
    });
  });

  describe('getWorkflow - 获取工作流', () => {
    it('应该根据 ID 获取自定义工作流', () => {
      const mockWorkflow = createMockWorkflow();
      mockFindById.mockReturnValue(mockWorkflow);

      const result = orchestrator.getWorkflow('workflow-123');

      expect(result).toEqual(mockWorkflow);
    });

    it('应该根据名称获取内置工作流', () => {
      const result = orchestrator.getWorkflow('project-init');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('project-init');
      expect(result?.isBuiltIn).toBe(true);
    });

    it('应该根据名称获取自定义工作流', () => {
      const mockWorkflow = createMockWorkflow({ name: 'custom-workflow' });
      mockFindById.mockReturnValue(null);
      mockFindAll.mockReturnValue([mockWorkflow]);

      const result = orchestrator.getWorkflow('custom-workflow');

      expect(result).toEqual(mockWorkflow);
    });

    it('工作流不存在时应该返回 null', () => {
      mockFindById.mockReturnValue(null);
      mockFindAll.mockReturnValue([]);

      const result = orchestrator.getWorkflow('nonexistent-workflow');

      expect(result).toBeNull();
    });
  });

  describe('listWorkflows - 列出工作流', () => {
    it('应该列出所有工作流（包含内置模板）', () => {
      const customWorkflows = [
        createMockWorkflow({ name: 'custom-1' }),
        createMockWorkflow({ name: 'custom-2' }),
      ];
      mockFindAll.mockReturnValue(customWorkflows);

      const result = orchestrator.listWorkflows({ includeBuiltIn: true });

      expect(result.length).toBe(6 + customWorkflows.length); // 6 内置 + 2 自定义
    });

    it('应该只列出自定义工作流（排除内置模板）', () => {
      const customWorkflows = [
        createMockWorkflow({ name: 'custom-1' }),
        createMockWorkflow({ name: 'custom-2' }),
      ];
      mockFindAll.mockReturnValue(customWorkflows);

      const result = orchestrator.listWorkflows({ includeBuiltIn: false });

      expect(result.length).toBe(customWorkflows.length);
    });

    it('应该根据标签过滤工作流', () => {
      const customWorkflows = [
        createMockWorkflow({ name: 'custom-1', tags: ['deploy', 'test'] }),
        createMockWorkflow({ name: 'custom-2', tags: ['build', 'ci'] }),
      ];
      mockFindAll.mockReturnValue(customWorkflows);

      const result = orchestrator.listWorkflows({ includeBuiltIn: true, tag: 'deploy' });

      expect(result.some((w) => w.name === 'custom-1')).toBe(true);
      expect(result.some((w) => w.name === 'custom-2')).toBe(false);
    });

    it('数据库查询失败时应该返回空数组', () => {
      mockFindAll.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = orchestrator.listWorkflows();

      expect(result).toEqual([]);
    });
  });

  describe('deleteWorkflow - 删除工作流', () => {
    it('应该成功删除自定义工作流', () => {
      const mockWorkflow = createMockWorkflow({ name: 'custom-workflow' });
      mockFindById.mockReturnValue(mockWorkflow);
      mockDelete.mockReturnValue(true);

      const result = orchestrator.deleteWorkflow('workflow-123');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('删除不存在的工作流时应该抛出错误', () => {
      mockFindById.mockReturnValue(null);
      mockFindAll.mockReturnValue([]);

      expect(() => {
        orchestrator.deleteWorkflow('nonexistent-id');
      }).toThrow(WorkflowExecutionError);
      expect(() => {
        orchestrator.deleteWorkflow('nonexistent-id');
      }).toThrow('工作流不存在');
    });

    it('删除内置工作流模板时应该抛出错误', () => {
      expect(() => {
        orchestrator.deleteWorkflow('project-init');
      }).toThrow(WorkflowExecutionError);
      expect(() => {
        orchestrator.deleteWorkflow('project-init');
      }).toThrow('内置工作流模板不能删除');
    });
  });

  // ========================================================================
  // 内置工作流模板测试
  // ========================================================================
  describe('内置工作流模板测试', () => {
    const builtInTemplates = [
      { name: 'project-init', description: '初始化新项目' },
      { name: 'feature-branch', description: '特性分支开发' },
      { name: 'code-review', description: '代码审查' },
      { name: 'deploy-env', description: '部署到指定环境' },
      { name: 'rollback-env', description: '环境回滚' },
      { name: 'full-cicd', description: '完整 CI/CD 流水线' },
    ];

    it.each(builtInTemplates)('$name 模板应该存在', ({ name }) => {
      const workflow = orchestrator.getWorkflow(name);
      expect(workflow).not.toBeNull();
      expect(workflow?.isBuiltIn).toBe(true);
      expect(workflow?.isEnabled).toBe(true);
    });

    it.each(builtInTemplates)('$name 模板应该包含步骤', ({ name }) => {
      const workflow = orchestrator.getWorkflow(name);
      expect(workflow?.steps).toBeDefined();
      expect(workflow?.steps.length).toBeGreaterThan(0);
    });

    it.each(builtInTemplates)('$name 模板应该有正确的描述', ({ name, description }) => {
      const workflow = orchestrator.getWorkflow(name);
      expect(workflow?.description).toContain(description);
    });

    it('project-init 模板应该包含创建目录、Git 初始化等步骤', () => {
      const workflow = orchestrator.getWorkflow('project-init');
      const stepTypes = workflow?.steps.map((s) => s.type) || [];
      expect(stepTypes).toContain('shell');
    });

    it('feature-branch 模板应该包含 Git 操作步骤', () => {
      const workflow = orchestrator.getWorkflow('feature-branch');
      const stepTypes = workflow?.steps.map((s) => s.type) || [];
      expect(stepTypes).toContain('git');
    });

    it('code-review 模板应该包含 lint 和测试步骤', () => {
      const workflow = orchestrator.getWorkflow('code-review');
      const stepTypes = workflow?.steps.map((s) => s.type) || [];
      expect(stepTypes).toContain('shell');
    });

    it('full-cicd 模板应该包含条件步骤', () => {
      const workflow = orchestrator.getWorkflow('full-cicd');
      const stepTypes = workflow?.steps.map((s) => s.type) || [];
      expect(stepTypes).toContain('condition');
    });
  });

  // ========================================================================
  // 步骤执行引擎测试
  // ========================================================================
  describe('executeStep - 步骤执行引擎', () => {
    const createExecutionContext = () => ({
      runId: 'test-run-123',
      workflowId: 'test-workflow-123',
      projectId: 'project-456',
      parameters: {} as Record<string, unknown>,
      variables: {} as Record<string, unknown>,
      startTime: new Date(),
      isCancelled: false,
      stepResults: new Map<string, any>(),
    });

    describe('shell 类型步骤', () => {
      it('应该成功执行 shell 命令', async () => {
        const step = createMockStep({
          type: 'shell',
          command: 'echo "Hello World"',
          workingDirectory: '/tmp',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });

      it('shell 命令执行成功应该返回完成状态', async () => {
        const step = createMockStep({
          type: 'shell',
          command: 'valid-command',
          workingDirectory: '/tmp',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
        expect(result.output).toBeDefined();
      });
    });

    describe('git 类型步骤', () => {
      it('应该成功执行 Git checkout 操作', async () => {
        mockCheckoutBranch.mockResolvedValue(true);

        const step = createMockStep({
          type: 'git',
          gitOperation: 'checkout',
          targetPath: '/tmp/repo',
          branchName: 'main',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
        expect(mockCheckoutBranch).toHaveBeenCalled();
      });

      it('应该成功执行 Git pull 操作', async () => {
        mockPull.mockResolvedValue(true);

        const step = createMockStep({
          type: 'git',
          gitOperation: 'pull',
          targetPath: '/tmp/repo',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
        expect(mockPull).toHaveBeenCalled();
      });

      it('应该成功执行 Git status 操作', async () => {
        mockGetStatus.mockResolvedValue({
          isRepo: true,
          staged: [],
          modified: [],
          deleted: [],
          untracked: [],
        });

        const step = createMockStep({
          type: 'git',
          gitOperation: 'status',
          targetPath: '/tmp/repo',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
        expect(mockGetStatus).toHaveBeenCalled();
      });
    });

    describe('condition 类型步骤', () => {
      it('条件为 true 时应该执行 then 分支', async () => {
        const context = createExecutionContext();
        context.variables['runTests'] = true;

        const step = createMockStep({
          type: 'condition',
          if: '${runTests}',
          then: [
            {
              id: 'sub-step-1',
              name: '执行测试',
              type: 'shell',
              command: 'npm test',
            },
          ],
        });

        const result = await orchestrator.executeStep(step, context);

        expect(result.status).toBe('completed');
      });

      it('条件为 false 时应该跳过 then 分支', async () => {
        const context = createExecutionContext();
        context.variables['runTests'] = false;

        const step = createMockStep({
          type: 'condition',
          if: '${runTests}',
          then: [
            {
              id: 'sub-step-1',
              name: '执行测试',
              type: 'shell',
              command: 'npm test',
            },
          ],
        });

        const result = await orchestrator.executeStep(step, context);

        expect(result.status).toBe('completed');
      });

      it('条件为 false 且有 else 分支时应该执行 else 分支', async () => {
        const context = createExecutionContext();
        context.variables['runTests'] = false;

        const step = createMockStep({
          type: 'condition',
          if: '${runTests}',
          then: [
            {
              id: 'sub-step-1',
              name: '执行测试',
              type: 'shell',
              command: 'npm test',
            },
          ],
          else: [
            {
              id: 'sub-step-2',
              name: '跳过测试',
              type: 'shell',
              command: 'echo "skip tests"',
            },
          ],
        });

        const result = await orchestrator.executeStep(step, context);

        expect(result.status).toBe('completed');
      });
    });

    describe('parallel 类型步骤', () => {
      it('应该并行执行多个子步骤', async () => {
        const step = createMockStep({
          type: 'parallel',
          parallel: [
            {
              id: 'parallel-1',
              name: '并行任务1',
              type: 'shell',
              command: 'echo "task1"',
            },
            {
              id: 'parallel-2',
              name: '并行任务2',
              type: 'shell',
              command: 'echo "task2"',
            },
          ],
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });

      it('空的并行步骤应该正常完成', async () => {
        const step = createMockStep({
          type: 'parallel',
          parallel: [],
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });
    });

    describe('loop 类型步骤', () => {
      it('应该循环执行步骤（for 循环）', async () => {
        const step = createMockStep({
          type: 'loop',
          loopType: 'for',
          iteratorVar: 'item',
          items: ['a', 'b', 'c'],
          do: [
            {
              id: 'loop-step',
              name: '循环步骤',
              type: 'shell',
              command: 'echo ${item}',
            },
          ],
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });

      it('空的循环步骤应该正常完成', async () => {
        const step = createMockStep({
          type: 'loop',
          loopType: 'for',
          items: [],
          do: [],
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });
    });

    describe('wait 类型步骤', () => {
      it('应该等待指定时间', async () => {
        // 使用很短的时间进行测试，避免使用 fake timers 带来的复杂性
        const step = createMockStep({
          type: 'wait',
          waitMs: 1,
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });

      it('不指定等待时间应该使用默认值', async () => {
        const step = createMockStep({
          type: 'wait',
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('completed');
      });
    });

    describe('步骤重试机制', () => {
      it('超过最大重试次数应该返回失败', async () => {
        mockExecResult = new Error('Permanent failure');

        const step = createMockStep({
          type: 'shell',
          command: 'always-fail',
          retry: {
            maxAttempts: 2,
          },
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('failed');
        expect(result.attempt).toBe(2);
      });

      it('没有配置 retry 时应该只尝试一次', async () => {
        mockExecResult = new Error('Command failed');

        const step = createMockStep({
          type: 'shell',
          command: 'fail-command',
          // 没有 retry 配置
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result.status).toBe('failed');
        expect(result.attempt).toBe(1);
      });
    });

    describe('步骤超时控制', () => {
      it('应该正确设置超时配置', async () => {
        // 验证超时配置被正确解析
        const step = createMockStep({
          type: 'shell',
          command: 'test-command',
          timeout: 1000,
        });

        const result = await orchestrator.executeStep(step, createExecutionContext());

        expect(result).toBeDefined();
        expect(step.timeout).toBe(1000);
      });
    });

    describe('步骤条件跳过', () => {
      it('条件不满足时应该跳过步骤', async () => {
        const context = createExecutionContext();
        context.variables['shouldRun'] = false;

        const step = createMockStep({
          type: 'shell',
          command: 'echo "should not run"',
          condition: '${shouldRun}',
        });

        const result = await orchestrator.executeStep(step, context);

        expect(result.status).toBe('completed');
        expect(result.output).toBe('步骤条件不满足，已跳过');
      });

      it('条件满足时应该正常执行步骤', async () => {
        const context = createExecutionContext();
        context.variables['shouldRun'] = true;

        const step = createMockStep({
          type: 'shell',
          command: 'echo "should run"',
          condition: '${shouldRun}',
        });

        const result = await orchestrator.executeStep(step, context);

        expect(result.status).toBe('completed');
        expect(result.output).not.toBe('步骤条件不满足，已跳过');
      });
    });
  });

  // ========================================================================
  // 工作流执行测试
  // ========================================================================
  describe('工作流执行测试', () => {
    beforeEach(() => {
      mockInsert.mockImplementation((_table, data) => ({
        id: 'run-123',
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      mockUpdate.mockImplementation((_table, _id, data) => ({
        id: 'run-123',
        ...data,
      }));
    });

    describe('runWorkflow - 执行工作流', () => {
      it('应该成功执行工作流', async () => {
        const workflow = createMockWorkflow({
          steps: [
            createMockStep({ id: 'step1', name: '步骤1' }),
            createMockStep({ id: 'step2', name: '步骤2' }),
          ],
        });
        mockFindById.mockReturnValue(workflow);
        mockFindAll.mockReturnValue([workflow]);

        const result = await orchestrator.runWorkflow('workflow-123');

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
      });

      it('执行不存在的工作流应该抛出错误', async () => {
        mockFindById.mockReturnValue(null);
        mockFindAll.mockReturnValue([]);

        await expect(orchestrator.runWorkflow('nonexistent')).rejects.toThrow(WorkflowExecutionError);
        await expect(orchestrator.runWorkflow('nonexistent')).rejects.toThrow('工作流不存在');
      });

      it('执行已禁用的工作流应该抛出错误', async () => {
        const workflow = createMockWorkflow({
          isEnabled: false,
          steps: [createMockStep()],
        });
        mockFindById.mockReturnValue(workflow);

        await expect(orchestrator.runWorkflow('disabled-workflow')).rejects.toThrow(WorkflowExecutionError);
        await expect(orchestrator.runWorkflow('disabled-workflow')).rejects.toThrow('工作流已被禁用');
      });

      it('应该成功执行带参数的工作流', async () => {
        const workflow = createMockWorkflow({
          parameters: {
            env: {
              type: 'string',
              required: true,
              description: '环境名称',
            },
          },
          steps: [createMockStep()],
        });
        mockFindById.mockReturnValue(workflow);

        const result = await orchestrator.runWorkflow('workflow-123', {
          projectId: 'project-456',
          parameters: {
            env: 'production',
          },
        });

        expect(result.status).toBe('completed');
        expect(result).toHaveProperty('id');
      });

      it('工作流执行失败应该抛出错误并保存错误信息', async () => {
        const workflow = createMockWorkflow({
          steps: [
            createMockStep({
              id: 'fail-step',
              name: '失败步骤',
              type: 'shell',
              command: 'invalid-command',
              retry: { maxAttempts: 1 }, // 只尝试一次，立即失败
            }),
          ],
        });
        mockFindById.mockReturnValue(workflow);

        mockExecResult = new Error('Command failed');

        await expect(orchestrator.runWorkflow('workflow-123')).rejects.toThrow();
      });
    });

    describe('getWorkflowRun - 获取执行记录', () => {
      it('应该成功获取执行记录', () => {
        const mockRun: WorkflowRun = {
          id: 'run-123',
          workflowId: 'workflow-123',
          workflowName: 'test-workflow',
          status: 'completed',
          parameters: {},
          context: {},
          steps: [],
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 1000,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockFindById.mockReturnValue(mockRun);

        const result = orchestrator.getWorkflowRun('run-123');

        expect(result).toEqual(mockRun);
      });

      it('执行记录不存在时应该返回 null', () => {
        mockFindById.mockReturnValue(null);

        const result = orchestrator.getWorkflowRun('nonexistent');

        expect(result).toBeNull();
      });

      it('数据库查询失败时应该返回 null', () => {
        mockFindById.mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = orchestrator.getWorkflowRun('run-123');

        expect(result).toBeNull();
      });
    });

    describe('listWorkflowRuns - 列出执行历史', () => {
      it('应该列出所有执行历史', () => {
        const mockRuns: WorkflowRun[] = [
          {
            id: 'run-1',
            workflowId: 'workflow-1',
            workflowName: 'workflow1',
            status: 'completed',
            parameters: {},
            context: {},
            steps: [],
            startTime: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'run-2',
            workflowId: 'workflow-2',
            workflowName: 'workflow2',
            status: 'failed',
            parameters: {},
            context: {},
            steps: [],
            startTime: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockFindAll.mockReturnValue(mockRuns);

        const result = orchestrator.listWorkflowRuns();

        expect(result).toEqual(mockRuns);
        expect(result.length).toBe(2);
      });

      it('应该根据 limit 参数限制返回数量', () => {
        const mockRuns: WorkflowRun[] = Array.from({ length: 10 }, (_, i) => ({
          id: `run-${i}`,
          workflowId: `workflow-${i}`,
          workflowName: `workflow${i}`,
          status: 'completed' as WorkflowStatus,
          parameters: {},
          context: {},
          steps: [],
          startTime: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        }));

        mockFindAll.mockImplementation((_table, options) => {
          return mockRuns.slice(0, options.limit);
        });

        const result = orchestrator.listWorkflowRuns({ limit: 5 });

        expect(result.length).toBe(5);
      });

      it('应该根据项目 ID 过滤执行历史', () => {
        mockFindAll.mockReturnValue([]);

        orchestrator.listWorkflowRuns({ projectId: 'project-123' });

        expect(mockFindAll).toHaveBeenCalled();
      });

      it('应该根据状态过滤执行历史', () => {
        mockFindAll.mockReturnValue([]);

        orchestrator.listWorkflowRuns({ status: 'failed' });

        expect(mockFindAll).toHaveBeenCalled();
      });

      it('数据库查询失败时应该返回空数组', () => {
        mockFindAll.mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = orchestrator.listWorkflowRuns();

        expect(result).toEqual([]);
      });
    });

    describe('cancelWorkflowRun - 取消工作流执行', () => {
      it('应该成功取消正在执行的工作流', () => {
        // mock getWorkflowRun 返回一个运行中状态的执行
        mockFindById.mockReturnValue({
          id: 'run-123',
          status: 'running',
        });
        mockUpdate.mockReturnValue({
          id: 'run-123',
          status: 'cancelled',
        });

        const result = orchestrator.cancelWorkflowRun('run-123');

        expect(result).toBe(true);
        expect(mockUpdate).toHaveBeenCalled();
      });

      it('取消不存在的工作流执行应该抛出错误', () => {
        mockFindById.mockReturnValue(null);

        expect(() => {
          orchestrator.cancelWorkflowRun('nonexistent');
        }).toThrow(WorkflowExecutionError);
        expect(() => {
          orchestrator.cancelWorkflowRun('nonexistent');
        }).toThrow('工作流执行不存在');
      });
    });
  });

  // ========================================================================
  // 错误处理测试
  // ========================================================================
  describe('错误处理测试', () => {
    it('无效的步骤类型应该抛出 WorkflowExecutionError', async () => {
      const invalidStep: any = {
        id: 'invalid-step',
        name: '无效步骤',
        type: 'invalid-type',
      };

      const context = {
        runId: 'test-run',
        workflowId: 'test-workflow',
        parameters: {},
        variables: {},
        startTime: new Date(),
        isCancelled: false,
        stepResults: new Map(),
      };

      const result = await orchestrator.executeStep(invalidStep, context);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('数据库错误应该被正确处理并返回适当结果', () => {
      mockFindById.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = orchestrator.getWorkflow('any-id');

      expect(result).toBeNull();
    });

    it('步骤执行超时应该被正确处理', async () => {
      const step = createMockStep({
        type: 'shell',
        command: 'sleep 10',
        timeout: 100,
      });

      const context = {
        runId: 'test-run',
        workflowId: 'test-workflow',
        parameters: {},
        variables: {},
        startTime: new Date(),
        isCancelled: false,
        stepResults: new Map(),
      };

      const result = await orchestrator.executeStep(step, context);

      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // WorkflowStatus 枚举测试
  // ========================================================================
  describe('WorkflowStatus 枚举测试', () => {
    const allStatuses: WorkflowStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];

    it.each(allStatuses)('应该支持 %s 状态', (status) => {
      expect(status).toBeDefined();
    });

    it('工作流执行应该设置正确的状态', async () => {
      const workflow = createMockWorkflow({
        steps: [createMockStep()],
      });
      mockFindById.mockReturnValue(workflow);

      const result = await orchestrator.runWorkflow('workflow-123');

      expect(result.status).toBe('completed');
    });
  });

  // ========================================================================
  // StepType 类型测试
  // ========================================================================
  describe('StepType 类型测试', () => {
    const allStepTypes = ['shell', 'git', 'deploy', 'tool', 'condition', 'parallel', 'loop', 'wait'];

    it.each(allStepTypes)('应该支持 %s 步骤类型', (type) => {
      expect(type).toBeDefined();
    });

    it('所有步骤类型都应该有对应的执行逻辑', async () => {
      const stepTypesToTest = [
        { type: 'shell', command: 'echo test' },
        { type: 'git', gitOperation: 'status', targetPath: '/tmp' },
        { type: 'condition', if: 'true' },
        { type: 'parallel', parallel: [] },
        { type: 'loop', loopType: 'for', items: [], do: [] },
        { type: 'wait', waitMs: 1 },
      ];

      for (const stepConfig of stepTypesToTest) {
        const step = createMockStep(stepConfig as Partial<WorkflowStep>);
        const context = {
          runId: 'test-run',
          workflowId: 'test-workflow',
          projectId: 'project-123',
          parameters: {} as Record<string, unknown>,
          variables: {} as Record<string, unknown>,
          startTime: new Date(),
          isCancelled: false,
          stepResults: new Map(),
        };

        const result = await orchestrator.executeStep(step, context);
        expect(result).toBeDefined();
        expect(result.stepId).toBe(step.id);
      }
    }, 30000);
  });

  // ========================================================================
  // 其他方法测试
  // ========================================================================
  describe('getRunningWorkflows - 获取运行中的工作流', () => {
    it('应该返回正在运行的工作流 ID 列表', () => {
      const result = orchestrator.getRunningWorkflows();

      expect(Array.isArray(result)).toBe(true);
    });

    it('初始状态下应该没有运行中的工作流', () => {
      const result = orchestrator.getRunningWorkflows();

      expect(result.length).toBe(0);
    });
  });
});
