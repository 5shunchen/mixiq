import { z } from 'zod';
import { validate, UUIDSchema } from '../utils/validator';
import type { AgentInstance, Message, AgentStatus, AgentConfig, Context } from '../types';

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// 使用类型断言来避免类型冲突
export type AgentManager = unknown;
export type ProjectManager = unknown;

// ==================== agent_create ====================

export const agentCreateSchema = z.object({
  agent_type: z
    .string({
      required_error: '智能体类型不能为空',
      invalid_type_error: '智能体类型必须是字符串类型',
    })
    .min(1, '智能体类型长度不能小于 1')
    .max(50, '智能体类型长度不能大于 50'),
  project_id: UUIDSchema,
  allowed_tools: z
    .array(z.string(), {
      invalid_type_error: '允许的工具列表必须是字符串数组',
    })
    .optional(),
  config: z
    .record(z.unknown(), {
      invalid_type_error: '配置必须是对象类型',
    })
    .optional(),
});

export type AgentCreateInput = z.infer<typeof agentCreateSchema>;

export const agent_create = {
  name: 'agent_create',
  description: '创建新的智能体实例。可以指定项目、允许的工具和自定义配置。',
  inputSchema: agentCreateSchema.shape,
};

export async function agentCreateHandler(
  agentManager: AgentManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ agent_id: string; token: string; status: AgentStatus }>> {
  try {
    const params = validate(agentCreateSchema, input, 'agent_create 参数校验失败');

    const managerImpl = agentManager as {
      createAgent: (
        projectId: string,
        agentType: string,
        allowedTools?: string[],
        config?: AgentConfig
      ) => {
        agent_id: string;
        token: string;
        status: AgentStatus;
      };
    };

    const result = managerImpl.createAgent(
      params.project_id,
      params.agent_type,
      params.allowed_tools,
      params.config as AgentConfig
    );

    return {
      success: true,
      data: {
        agent_id: result.agent_id,
        token: result.token,
        status: result.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_list ====================

export const agentListSchema = z.object({
  project_id: UUIDSchema,
});

export type AgentListInput = z.infer<typeof agentListSchema>;

export const agent_list = {
  name: 'agent_list',
  description: '列出指定项目下的所有智能体实例。',
  inputSchema: agentListSchema.shape,
};

export async function agentListHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<AgentInstance[]>> {
  try {
    const params = validate(agentListSchema, input, 'agent_list 参数校验失败');

    const managerImpl = agentManager as {
      listAgents: (projectId: string) => AgentInstance[];
    };

    const result = managerImpl.listAgents(params.project_id);

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

// ==================== agent_info ====================

export const agentInfoSchema = z.object({
  agent_id: UUIDSchema,
});

export type AgentInfoInput = z.infer<typeof agentInfoSchema>;

export const agent_info = {
  name: 'agent_info',
  description: '获取智能体的详细信息，包括状态、配置和上下文。',
  inputSchema: agentInfoSchema.shape,
};

export async function agentInfoHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<AgentInstance>> {
  try {
    const params = validate(agentInfoSchema, input, 'agent_info 参数校验失败');

    const managerImpl = agentManager as {
      getAgent: (agentId: string) => AgentInstance;
    };

    const result = managerImpl.getAgent(params.agent_id);

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

// ==================== agent_switch ====================

export const agentSwitchSchema = z.object({
  agent_id: UUIDSchema,
});

export type AgentSwitchInput = z.infer<typeof agentSwitchSchema>;

export const agent_switch = {
  name: 'agent_switch',
  description: '切换当前活动智能体。切换后，后续所有操作都将在该智能体的上下文中执行。',
  inputSchema: agentSwitchSchema.shape,
};

export async function agentSwitchHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<{ agent_id: string; status: string; switched_at: Date }>> {
  try {
    const params = validate(agentSwitchSchema, input, 'agent_switch 参数校验失败');

    const managerImpl = agentManager as {
      switchAgent: (agentId: string) => void;
      getAgent: (agentId: string) => AgentInstance;
    };

    managerImpl.switchAgent(params.agent_id);
    const agent = managerImpl.getAgent(params.agent_id);
    const switchedAt = new Date();

    return {
      success: true,
      data: {
        agent_id: params.agent_id,
        status: agent.status,
        switched_at: switchedAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_delete ====================

export const agentDeleteSchema = z.object({
  agent_id: UUIDSchema,
});

export type AgentDeleteInput = z.infer<typeof agentDeleteSchema>;

export const agent_delete = {
  name: 'agent_delete',
  description: '删除指定的智能体实例。删除后，该智能体将无法再使用。',
  inputSchema: agentDeleteSchema.shape,
};

export async function agentDeleteHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<{ agent_id: string; deleted: boolean }>> {
  try {
    const params = validate(agentDeleteSchema, input, 'agent_delete 参数校验失败');

    const managerImpl = agentManager as {
      deleteAgent: (agentId: string) => boolean;
    };

    const result = managerImpl.deleteAgent(params.agent_id);

    return {
      success: true,
      data: {
        agent_id: params.agent_id,
        deleted: result,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_set_context ====================

export const agentSetContextSchema = z.object({
  agent_id: UUIDSchema,
  key: z
    .string({
      required_error: '上下文键不能为空',
      invalid_type_error: '上下文键必须是字符串类型',
    })
    .min(1, '上下文键长度不能小于 1')
    .max(100, '上下文键长度不能大于 100'),
  value: z.unknown({
    required_error: '上下文值不能为空',
  }),
});

export type AgentSetContextInput = z.infer<typeof agentSetContextSchema>;

export const agent_set_context = {
  name: 'agent_set_context',
  description: '设置智能体的上下文键值对。可以存储任意 JSON 类型的值。',
  inputSchema: agentSetContextSchema.shape,
};

export async function agentSetContextHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<{ key: string; updated_at: Date }>> {
  try {
    const params = validate(agentSetContextSchema, input, 'agent_set_context 参数校验失败');

    const managerImpl = agentManager as {
      setContext: (agentId: string, key: string, value: unknown) => void;
    };

    managerImpl.setContext(params.agent_id, params.key, params.value);
    const updatedAt = new Date();

    return {
      success: true,
      data: {
        key: params.key,
        updated_at: updatedAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_get_context ====================

export const agentGetContextSchema = z.object({
  agent_id: UUIDSchema,
  key: z.string().optional(),
});

export type AgentGetContextInput = z.infer<typeof agentGetContextSchema>;

export const agent_get_context = {
  name: 'agent_get_context',
  description: '获取智能体的上下文信息。如果指定了 key，则返回该键的值；否则返回所有上下文。',
  inputSchema: agentGetContextSchema.shape,
};

export async function agentGetContextHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<Record<string, unknown>>> {
  try {
    const params = validate(agentGetContextSchema, input, 'agent_get_context 参数校验失败');

    const managerImpl = agentManager as {
      getContext: (agentId: string, key?: string) => Context | unknown;
    };

    const result = managerImpl.getContext(params.agent_id, params.key);

    if (params.key !== undefined) {
      return {
        success: true,
        data: { [params.key]: result },
      };
    }

    return {
      success: true,
      data: result as Record<string, unknown>,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_get_tools ====================

export const agentGetToolsSchema = z.object({
  agent_id: UUIDSchema,
});

export type AgentGetToolsInput = z.infer<typeof agentGetToolsSchema>;

export const agent_get_tools = {
  name: 'agent_get_tools',
  description: '获取智能体可用的工具列表，返回每个工具的名称。',
  inputSchema: agentGetToolsSchema.shape,
};

export async function agentGetToolsHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<{ tools: string[] }>> {
  try {
    const params = validate(agentGetToolsSchema, input, 'agent_get_tools 参数校验失败');

    const managerImpl = agentManager as {
      getAgent: (agentId: string) => AgentInstance;
    };

    const agent = managerImpl.getAgent(params.agent_id);

    return {
      success: true,
      data: {
        tools: agent.allowed_tools || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== agent_get_history ====================

export const agentGetHistorySchema = z.object({
  agent_id: UUIDSchema,
  limit: z
    .number({
      invalid_type_error: '限制条数必须是数字类型',
    })
    .int('限制条数必须是整数')
    .min(1, '限制条数不能小于 1')
    .max(1000, '限制条数不能大于 1000')
    .default(50)
    .optional(),
});

export type AgentGetHistoryInput = z.infer<typeof agentGetHistorySchema>;

export const agent_get_history = {
  name: 'agent_get_history',
  description: '获取智能体的对话历史记录，包括用户消息和助手回复。',
  inputSchema: agentGetHistorySchema.shape,
};

export async function agentGetHistoryHandler(
  agentManager: AgentManager,
  input: unknown
): Promise<ToolResult<{ history: Message[] }>> {
  try {
    const params = validate(agentGetHistorySchema, input, 'agent_get_history 参数校验失败');

    const managerImpl = agentManager as {
      getHistory: (agentId: string, limit?: number) => Message[];
    };

    const result = managerImpl.getHistory(params.agent_id, params.limit);

    return {
      success: true,
      data: {
        history: result,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== 工具导出 ====================

export const agentTools = [
  {
    tool: agent_create,
    handler: agentCreateHandler,
  },
  {
    tool: agent_list,
    handler: agentListHandler,
  },
  {
    tool: agent_info,
    handler: agentInfoHandler,
  },
  {
    tool: agent_switch,
    handler: agentSwitchHandler,
  },
  {
    tool: agent_delete,
    handler: agentDeleteHandler,
  },
  {
    tool: agent_set_context,
    handler: agentSetContextHandler,
  },
  {
    tool: agent_get_context,
    handler: agentGetContextHandler,
  },
  {
    tool: agent_get_tools,
    handler: agentGetToolsHandler,
  },
  {
    tool: agent_get_history,
    handler: agentGetHistoryHandler,
  },
];

/**
 * 注册所有智能体管理工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param agentManager 智能体管理器实例
 * @param projectManager 项目管理器实例
 */
export function registerAgentTools(
  toolRegistry: ToolRegistry,
  agentManager: AgentManager,
  projectManager: ProjectManager
): void {
  for (const item of agentTools) {
    const handler = async (params: Record<string, unknown>) => {
      if (item.tool.name === 'agent_create') {
        return item.handler(agentManager, projectManager, params);
      }
      return (item.handler as (manager: AgentManager, input: unknown) => Promise<ToolResult<unknown>>)(
        agentManager,
        params
      );
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
