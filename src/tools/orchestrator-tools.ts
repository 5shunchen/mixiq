import { z } from 'zod';
import { validate, UUIDSchema } from '../utils/validator';

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * 编排管理器类型（类型断言用）
 */
export type Orchestrator = unknown;

// ==================== 工作流相关类型定义 ====================

/**
 * 工作流步骤类型
 */
export type WorkflowStepType = 'action' | 'condition' | 'parallel' | 'wait' | 'loop';

/**
 * 工作流步骤定义
 */
export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  name: string;
  description?: string;
  tool?: string;
  params?: Record<string, unknown>;
  condition?: string;
  branches?: Record<string, WorkflowStep[]>;
  steps?: WorkflowStep[];
  timeout?: number;
  retry?: number;
  on_error?: 'continue' | 'stop' | 'rollback';
  depends_on?: string[];
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  steps: WorkflowStep[];
  parameters?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: unknown;
    description?: string;
  }>;
  timeout?: number;
  tags?: string[];
  is_builtin: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * 工作流执行状态
 */
export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

/**
 * 工作流步骤执行状态
 */
export interface StepExecutionState {
  step_id: string;
  status: WorkflowRunStatus;
  result?: unknown;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
  attempt: number;
}

/**
 * 工作流执行记录
 */
export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  project_id?: string;
  params: Record<string, unknown>;
  status: WorkflowRunStatus;
  steps: StepExecutionState[];
  result?: unknown;
  error?: string;
  started_at: Date;
  completed_at?: Date;
  cancelled_at?: Date;
}

// ==================== workflow_list ====================

export const workflowListSchema = z.object({});

export type WorkflowListInput = z.infer<typeof workflowListSchema>;

export const workflow_list = {
  name: 'workflow_list',
  description: '列出所有可用的工作流定义，包括内置工作流和自定义工作流。',
  inputSchema: workflowListSchema.shape,
};

export async function workflowListHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{ workflows: WorkflowDefinition[] }>> {
  try {
    validate(workflowListSchema, input, 'workflow_list 参数校验失败');

    const orchestratorImpl = orchestrator as {
      listWorkflows: () => Promise<WorkflowDefinition[]>;
    };
    const workflows = await orchestratorImpl.listWorkflows();

    return {
      success: true,
      data: { workflows },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_create ====================

export const workflowStepSchema: z.ZodSchema<WorkflowStep> = z.lazy(() =>
  z.object({
    id: z
      .string({
        required_error: '步骤 ID 不能为空',
        invalid_type_error: '步骤 ID 必须是字符串类型',
      })
      .min(1, '步骤 ID 长度不能小于 1'),
    type: z.enum(['action', 'condition', 'parallel', 'wait', 'loop'], {
      required_error: '步骤类型不能为空',
      invalid_type_error: '步骤类型无效',
    }),
    name: z
      .string({
        required_error: '步骤名称不能为空',
        invalid_type_error: '步骤名称必须是字符串类型',
      })
      .min(1, '步骤名称长度不能小于 1'),
    description: z.string().optional(),
    tool: z.string().optional(),
    params: z.record(z.unknown()).optional(),
    condition: z.string().optional(),
    branches: z.record(z.array(workflowStepSchema)).optional(),
    steps: z.array(workflowStepSchema).optional(),
    timeout: z.number().int().min(0).optional(),
    retry: z.number().int().min(0).optional(),
    on_error: z.enum(['continue', 'stop', 'rollback']).optional(),
    depends_on: z.array(z.string()).optional(),
  })
);

export const workflowCreateSchema = z.object({
  name: z
    .string({
      required_error: '工作流名称不能为空',
      invalid_type_error: '工作流名称必须是字符串类型',
    })
    .min(1, '工作流名称长度不能小于 1')
    .max(100, '工作流名称长度不能大于 100')
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/,
      '工作流名称只能包含字母、数字、连字符和下划线，且必须以字母或数字开头'
    ),
  definition: z.object({
    version: z.string().optional().default('1.0.0'),
    steps: z
      .array(workflowStepSchema, {
        required_error: '工作流步骤不能为空',
        invalid_type_error: '工作流步骤必须是数组类型',
      })
      .min(1, '工作流至少需要一个步骤'),
    parameters: z
      .record(
        z.object({
          type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
          required: z.boolean().optional(),
          default: z.unknown().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),
    timeout: z.number().int().min(0).optional(),
    tags: z.array(z.string()).optional(),
  }),
  description: z.string().max(500, '工作流描述长度不能大于 500').optional(),
});

export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;

export const workflow_create = {
  name: 'workflow_create',
  description: '创建自定义工作流定义。支持定义多步骤、并行执行、条件分支、重试机制等复杂的工作流编排。',
  inputSchema: workflowCreateSchema.shape,
};

export async function workflowCreateHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{ workflow_id: string; name: string; created_at: Date }>> {
  try {
    const params = validate(workflowCreateSchema, input, 'workflow_create 参数校验失败');

    const orchestratorImpl = orchestrator as {
      createWorkflow: (
        name: string,
        definition: WorkflowCreateInput['definition'] & { version: string },
        description?: string
      ) => Promise<{ workflow_id: string; name: string; created_at: Date }>;
    };
    // 确保 version 字段有默认值
    const definition = {
      version: '1.0.0',
      ...params.definition,
    };
    const result = await orchestratorImpl.createWorkflow(params.name, definition, params.description);

    return {
      success: true,
      data: {
        workflow_id: result.workflow_id,
        name: result.name,
        created_at: result.created_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_get ====================

const workflowGetBaseSchema = z.object({
  workflow_id: UUIDSchema.optional(),
  name: z.string().optional(),
});

export const workflowGetSchema = workflowGetBaseSchema.refine(
  (data) => data.workflow_id || data.name,
  '必须提供 workflow_id 或 name 中的至少一个'
);

export type WorkflowGetInput = z.infer<typeof workflowGetSchema>;

export const workflow_get = {
  name: 'workflow_get',
  description: '获取工作流的详细定义，包括步骤结构、参数定义、超时配置等。',
  inputSchema: workflowGetBaseSchema.shape,
};

export async function workflowGetHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<WorkflowDefinition>> {
  try {
    const params = validate(workflowGetSchema, input, 'workflow_get 参数校验失败');

    const orchestratorImpl = orchestrator as {
      getWorkflow: (workflowId?: string, name?: string) => Promise<WorkflowDefinition>;
    };
    const workflow = await orchestratorImpl.getWorkflow(params.workflow_id, params.name);

    return {
      success: true,
      data: workflow,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_delete ====================

export const workflowDeleteSchema = z.object({
  workflow_id: UUIDSchema,
});

export type WorkflowDeleteInput = z.infer<typeof workflowDeleteSchema>;

export const workflow_delete = {
  name: 'workflow_delete',
  description: '删除自定义工作流定义。内置工作流不可删除。',
  inputSchema: workflowDeleteSchema.shape,
};

export async function workflowDeleteHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{ workflow_id: string; deleted: boolean }>> {
  try {
    const params = validate(workflowDeleteSchema, input, 'workflow_delete 参数校验失败');

    const orchestratorImpl = orchestrator as {
      deleteWorkflow: (workflowId: string) => Promise<boolean>;
    };
    const deleted = await orchestratorImpl.deleteWorkflow(params.workflow_id);

    return {
      success: true,
      data: {
        workflow_id: params.workflow_id,
        deleted,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_run ====================

const workflowRunBaseSchema = z.object({
  workflow_id: UUIDSchema.optional(),
  name: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  project_id: UUIDSchema.optional(),
});

export const workflowRunSchema = workflowRunBaseSchema.refine(
  (data) => data.workflow_id || data.name,
  '必须提供 workflow_id 或 name 中的至少一个'
);

export type WorkflowRunInput = z.infer<typeof workflowRunSchema>;

export const workflow_run = {
  name: 'workflow_run',
  description: '执行指定的工作流。可以通过 workflow_id 或 name 指定工作流，并传入执行参数。',
  inputSchema: workflowRunBaseSchema.shape,
};

export async function workflowRunHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{ run_id: string; status: WorkflowRunStatus; started_at: Date }>> {
  try {
    const params = validate(workflowRunSchema, input, 'workflow_run 参数校验失败');

    const orchestratorImpl = orchestrator as {
      runWorkflow: (
        workflowId?: string,
        name?: string,
        runParams?: Record<string, unknown>,
        projectId?: string
      ) => Promise<{ run_id: string; status: WorkflowRunStatus; started_at: Date }>;
    };
    const result = await orchestratorImpl.runWorkflow(
      params.workflow_id,
      params.name,
      params.params,
      params.project_id
    );

    return {
      success: true,
      data: {
        run_id: result.run_id,
        status: result.status,
        started_at: result.started_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_run_status ====================

export const workflowRunStatusSchema = z.object({
  run_id: UUIDSchema,
});

export type WorkflowRunStatusInput = z.infer<typeof workflowRunStatusSchema>;

export const workflow_run_status = {
  name: 'workflow_run_status',
  description: '获取工作流执行的实时状态，包括每个步骤的执行情况、结果和错误信息。',
  inputSchema: workflowRunStatusSchema.shape,
};

export async function workflowRunStatusHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{
  run_id: string;
  status: WorkflowRunStatus;
  steps: StepExecutionState[];
  result?: unknown;
  started_at: Date;
  completed_at?: Date;
}>> {
  try {
    const params = validate(workflowRunStatusSchema, input, 'workflow_run_status 参数校验失败');

    const orchestratorImpl = orchestrator as {
      getWorkflowRunStatus: (runId: string) => Promise<{
        run_id: string;
        status: WorkflowRunStatus;
        steps: StepExecutionState[];
        result?: unknown;
        started_at: Date;
        completed_at?: Date;
      }>;
    };
    const result = await orchestratorImpl.getWorkflowRunStatus(params.run_id);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_run_cancel ====================

export const workflowRunCancelSchema = z.object({
  run_id: UUIDSchema,
});

export type WorkflowRunCancelInput = z.infer<typeof workflowRunCancelSchema>;

export const workflow_run_cancel = {
  name: 'workflow_run_cancel',
  description: '取消正在执行的工作流。已完成的步骤不受影响，正在执行的步骤将被中断。',
  inputSchema: workflowRunCancelSchema.shape,
};

export async function workflowRunCancelHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<{ run_id: string; status: 'cancelled'; cancelled_at: Date }>> {
  try {
    const params = validate(workflowRunCancelSchema, input, 'workflow_run_cancel 参数校验失败');

    const orchestratorImpl = orchestrator as {
      cancelWorkflowRun: (runId: string) => Promise<Date>;
    };
    const cancelledAt = await orchestratorImpl.cancelWorkflowRun(params.run_id);

    return {
      success: true,
      data: {
        run_id: params.run_id,
        status: 'cancelled',
        cancelled_at: cancelledAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== workflow_run_list ====================

export const workflowRunListSchema = z.object({
  project_id: UUIDSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

export type WorkflowRunListInput = z.infer<typeof workflowRunListSchema>;

export const workflow_run_list = {
  name: 'workflow_run_list',
  description: '列出工作流执行历史记录。支持按项目过滤和数量限制。',
  inputSchema: workflowRunListSchema.shape,
};

export async function workflowRunListHandler(
  orchestrator: Orchestrator,
  input: unknown
): Promise<ToolResult<WorkflowRun[]>> {
  try {
    const params = validate(workflowRunListSchema, input, 'workflow_run_list 参数校验失败');

    const orchestratorImpl = orchestrator as {
      listWorkflowRuns: (projectId?: string, limit?: number) => Promise<WorkflowRun[]>;
    };
    const runs = await orchestratorImpl.listWorkflowRuns(params.project_id, params.limit);

    return {
      success: true,
      data: runs,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== 工具导出 ====================

export const orchestratorTools = [
  {
    tool: workflow_list,
    handler: workflowListHandler,
  },
  {
    tool: workflow_create,
    handler: workflowCreateHandler,
  },
  {
    tool: workflow_get,
    handler: workflowGetHandler,
  },
  {
    tool: workflow_delete,
    handler: workflowDeleteHandler,
  },
  {
    tool: workflow_run,
    handler: workflowRunHandler,
  },
  {
    tool: workflow_run_status,
    handler: workflowRunStatusHandler,
  },
  {
    tool: workflow_run_cancel,
    handler: workflowRunCancelHandler,
  },
  {
    tool: workflow_run_list,
    handler: workflowRunListHandler,
  },
];

/**
 * 注册所有任务编排工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param orchestrator 编排管理器实例
 */
export function registerOrchestratorTools(
  toolRegistry: ToolRegistry,
  orchestrator: Orchestrator
): void {
  for (const item of orchestratorTools) {
    const handler = async (params: Record<string, unknown>) => {
      return item.handler(orchestrator, params);
    };
    toolRegistry.registerTool(
      {
        name: item.tool.name,
        description: item.tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: item.tool.inputSchema,
        },
      },
      handler
    );
  }
}

// 仅用于类型定义
class ToolRegistry {
  registerTool(_definition: unknown, _handler: unknown): void {}
}
