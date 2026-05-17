import { z } from 'zod';
import { validate } from '../utils/validator';
import type { Project, Environment } from '../types';

// 使用类型断言来避免类型冲突
export type ProjectManager = unknown;

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ==================== project_init ====================

export const projectInitSchema = z.object({
  name: z
    .string({
      required_error: '项目名称不能为空',
      invalid_type_error: '项目名称必须是字符串类型',
    })
    .min(1, '项目名称长度不能小于 1')
    .max(100, '项目名称长度不能大于 100')
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/,
      '项目名称只能包含字母、数字、连字符和下划线，且必须以字母或数字开头'
    ),
  template: z
    .string({
      invalid_type_error: '模板名称必须是字符串类型',
    })
    .optional(),
  git_url: z
    .string({
      invalid_type_error: 'Git 仓库地址必须是字符串类型',
    })
    .url('Git 仓库地址格式不正确')
    .optional(),
});

export type ProjectInitInput = z.infer<typeof projectInitSchema>;

export const project_init = {
  name: 'project_init',
  description: '初始化一个新项目，创建工作空间目录并配置 Git 仓库。支持从指定模板创建项目。',
  inputSchema: projectInitSchema.shape,
};

export async function projectInitHandler(
  manager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ project_id: string; workspace_path: string }>> {
  try {
    const params = validate(projectInitSchema, input, 'project_init 参数校验失败');

    const managerImpl = manager as {
      initProject: (name: string, template?: string, gitUrl?: string) => Promise<{
        project_id: string;
        workspace_path: string;
      }>;
    };
    const result = await managerImpl.initProject(params.name, params.template, params.git_url);

    return {
      success: true,
      data: {
        project_id: result.project_id,
        workspace_path: result.workspace_path,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== project_switch ====================

export const projectSwitchSchema = z.object({
  project_id: z
    .string({
      required_error: '项目 ID 不能为空',
      invalid_type_error: '项目 ID 必须是字符串类型',
    })
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      '项目 ID 格式不正确，必须符合 UUID v4 格式'
    ),
});

export type ProjectSwitchInput = z.infer<typeof projectSwitchSchema>;

export const project_switch = {
  name: 'project_switch',
  description: '切换当前工作项目。切换后，后续所有操作都将在该项目的上下文中执行。',
  inputSchema: projectSwitchSchema.shape,
};

export async function projectSwitchHandler(
  manager: ProjectManager,
  input: unknown
): Promise<ToolResult<{
  project_id: string;
  name: string;
  current_branch: string;
  environments: Environment[];
}>> {
  try {
    const params = validate(projectSwitchSchema, input, 'project_switch 参数校验失败');

    const managerImpl = manager as {
      switchProject: (projectId: string) => Promise<{
        project_id: string;
        name: string;
        current_branch: string;
        environments: Environment[];
      }>;
    };
    const result = await managerImpl.switchProject(params.project_id);

    return {
      success: true,
      data: {
        project_id: result.project_id,
        name: result.name,
        current_branch: result.current_branch,
        environments: result.environments,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== project_info ====================

export const projectInfoSchema = z.object({});

export type ProjectInfoInput = z.infer<typeof projectInfoSchema>;

export const project_info = {
  name: 'project_info',
  description: '获取当前项目的详细信息，包括项目配置、Git 远程地址、环境列表和活动 Agent 数量。',
  inputSchema: projectInfoSchema.shape,
};

export async function projectInfoHandler(
  manager: ProjectManager,
  input: unknown
): Promise<ToolResult<Project & { environments: Environment[]; active_agents: number }>> {
  try {
    validate(projectInfoSchema, input, 'project_info 参数校验失败');

    const managerImpl = manager as {
      getProjectInfo: () => Promise<Project & { environments: Environment[]; active_agents: number }>;
    };
    const result = await managerImpl.getProjectInfo();

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

// ==================== 工具导出 ====================

export const projectTools = [
  {
    tool: project_init,
    handler: projectInitHandler,
  },
  {
    tool: project_switch,
    handler: projectSwitchHandler,
  },
  {
    tool: project_info,
    handler: projectInfoHandler,
  },
];

/**
 * 注册所有项目管理工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param projectManager 项目管理器实例
 */
export function registerProjectTools(
  toolRegistry: ToolRegistry,
  projectManager: ProjectManager
): void {
  for (const item of projectTools) {
    const handler = async (params: Record<string, unknown>) => {
      return item.handler(projectManager, params);
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
