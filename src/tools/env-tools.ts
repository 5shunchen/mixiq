import { z } from 'zod';
import { validate, UUIDSchema } from '../utils/validator';
import type { Environment, Deployment, SSHServer } from '../types';

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * 环境管理器类型
 */
export type EnvManager = unknown;

/**
 * 项目管理器类型
 */
export type ProjectManager = unknown;

/**
 * 服务器配置 Schema
 */
const SSHServerSchema: z.ZodSchema<SSHServer> = z.object({
  host: z
    .string({
      required_error: '服务器主机地址不能为空',
      invalid_type_error: '服务器主机地址必须是字符串类型',
    })
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-._]*[a-zA-Z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/,
      '主机地址格式不正确，必须是有效的域名或 IP 地址'
    ),
  port: z
    .number({
      required_error: '端口号不能为空',
      invalid_type_error: '端口号必须是数字类型',
    })
    .int('端口号必须是整数')
    .min(1, '端口号不能小于 1')
    .max(65535, '端口号不能大于 65535'),
  username: z
    .string({
      required_error: '用户名不能为空',
      invalid_type_error: '用户名必须是字符串类型',
    })
    .min(1, '用户名长度不能小于 1')
    .max(255, '用户名长度不能大于 255'),
  privateKeyPath: z
    .string({
      required_error: '私钥路径不能为空',
      invalid_type_error: '私钥路径必须是字符串类型',
    })
    .min(1, '私钥路径长度不能小于 1'),
});

/**
 * 环境名称 Schema
 */
const EnvNameSchema = z
  .string({
    required_error: '环境名称不能为空',
    invalid_type_error: '环境名称必须是字符串类型',
  })
  .min(1, '环境名称长度不能小于 1')
  .max(50, '环境名称长度不能大于 50')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/,
    '环境名称只能包含字母、数字、连字符和下划线，且必须以字母或数字开头'
  );

// ==================== env_list ====================

export const envListSchema = z.object({
  project_id: UUIDSchema.optional(),
});

export type EnvListInput = z.infer<typeof envListSchema>;

export const env_list = {
  name: 'env_list',
  description: '列出项目的所有环境，包括每个环境的名称、服务器配置和创建时间。',
  inputSchema: envListSchema.shape,
};

export async function envListHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<Environment[]>> {
  try {
    const params = validate(envListSchema, input, 'env_list 参数校验失败');

    const managerImpl = envManager as {
      listEnvironments: (projectId?: string) => Promise<Environment[]>;
    };
    const environments = await managerImpl.listEnvironments(params.project_id);

    return {
      success: true,
      data: environments,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== env_create ====================

export const envCreateSchema = z.object({
  project_id: UUIDSchema.optional(),
  name: EnvNameSchema,
  servers: z
    .array(SSHServerSchema, {
      required_error: '服务器列表不能为空',
      invalid_type_error: '服务器列表必须是数组类型',
    })
    .min(1, '至少需要配置一台服务器'),
  config: z
    .record(z.unknown(), {
      invalid_type_error: '配置必须是对象类型',
    })
    .optional(),
});

export type EnvCreateInput = z.infer<typeof envCreateSchema>;

export const env_create = {
  name: 'env_create',
  description: '创建新的部署环境，配置服务器列表和环境参数。',
  inputSchema: envCreateSchema.shape,
};

export async function envCreateHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ env_name: string; created: boolean }>> {
  try {
    const params = validate(envCreateSchema, input, 'env_create 参数校验失败');

    const managerImpl = envManager as {
      createEnvironment: (
        name: string,
        servers: SSHServer[],
        projectId?: string,
        config?: Record<string, unknown>
      ) => Promise<{ env_name: string; created: boolean }>;
    };
    const result = await managerImpl.createEnvironment(
      params.name,
      params.servers,
      params.project_id,
      params.config
    );

    return {
      success: true,
      data: {
        env_name: result.env_name,
        created: result.created,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== env_info ====================

export const envInfoSchema = z.object({
  env_name: EnvNameSchema,
  project_id: UUIDSchema.optional(),
});

export type EnvInfoInput = z.infer<typeof envInfoSchema>;

export const env_info = {
  name: 'env_info',
  description: '获取环境详细信息，包括服务器配置、当前部署状态和健康检查结果。',
  inputSchema: envInfoSchema.shape,
};

export async function envInfoHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<Environment & { current_deployment?: Deployment; status: string }>> {
  try {
    const params = validate(envInfoSchema, input, 'env_info 参数校验失败');

    const managerImpl = envManager as {
      getEnvironmentInfo: (
        envName: string,
        projectId?: string
      ) => Promise<Environment & { current_deployment?: Deployment; status: string }>;
    };
    const result = await managerImpl.getEnvironmentInfo(params.env_name, params.project_id);

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

// ==================== env_deploy ====================

export const envDeploySchema = z.object({
  env_name: EnvNameSchema,
  branch: z
    .string({
      required_error: '分支名称不能为空',
      invalid_type_error: '分支名称必须是字符串类型',
    })
    .min(1, '分支名称长度不能小于 1')
    .max(100, '分支名称长度不能大于 100'),
  project_id: UUIDSchema.optional(),
  force: z
    .boolean({
      invalid_type_error: 'force 必须是布尔类型',
    })
    .optional(),
});

export type EnvDeployInput = z.infer<typeof envDeploySchema>;

export const env_deploy = {
  name: 'env_deploy',
  description: '将指定分支部署到目标环境，执行构建和健康检查。',
  inputSchema: envDeploySchema.shape,
};

export async function envDeployHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<
  ToolResult<{
    deployment_id: string;
    status: 'pending' | 'deploying' | 'success' | 'failed';
    health_check_result: { healthy: boolean; details: object };
  }>
> {
  try {
    const params = validate(envDeploySchema, input, 'env_deploy 参数校验失败');

    const managerImpl = envManager as {
      deployEnvironment: (
        envName: string,
        branch: string,
        projectId?: string,
        force?: boolean
      ) => Promise<{
        deployment_id: string;
        status: 'pending' | 'deploying' | 'success' | 'failed';
        health_check_result: { healthy: boolean; details: object };
      }>;
    };
    const result = await managerImpl.deployEnvironment(
      params.env_name,
      params.branch,
      params.project_id,
      params.force
    );

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

// ==================== env_rollback ====================

export const envRollbackSchema = z.object({
  env_name: EnvNameSchema,
  deployment_id: UUIDSchema.optional(),
  project_id: UUIDSchema.optional(),
});

export type EnvRollbackInput = z.infer<typeof envRollbackSchema>;

export const env_rollback = {
  name: 'env_rollback',
  description: '回滚环境到上一个成功的部署版本，或指定的 deployment_id。',
  inputSchema: envRollbackSchema.shape,
};

export async function envRollbackHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ deployment_id: string; status: 'pending' | 'success' | 'failed' }>> {
  try {
    const params = validate(envRollbackSchema, input, 'env_rollback 参数校验失败');

    const managerImpl = envManager as {
      rollbackDeployment: (
        envName: string,
        deploymentId?: string,
        projectId?: string
      ) => Promise<{ deployment_id: string; status: 'pending' | 'success' | 'failed' }>;
    };
    const result = await managerImpl.rollbackDeployment(
      params.env_name,
      params.deployment_id,
      params.project_id
    );

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

// ==================== env_deployment_history ====================

export const envDeploymentHistorySchema = z.object({
  env_name: EnvNameSchema,
  project_id: UUIDSchema.optional(),
  limit: z
    .number({
      invalid_type_error: 'limit 必须是数字类型',
    })
    .int('limit 必须是整数')
    .min(1, 'limit 不能小于 1')
    .max(100, 'limit 不能大于 100')
    .optional(),
});

export type EnvDeploymentHistoryInput = z.infer<typeof envDeploymentHistorySchema>;

export const env_deployment_history = {
  name: 'env_deployment_history',
  description: '获取指定环境的部署历史记录，包括每次部署的状态、分支和时间。',
  inputSchema: envDeploymentHistorySchema.shape,
};

export async function envDeploymentHistoryHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<Deployment[]>> {
  try {
    const params = validate(
      envDeploymentHistorySchema,
      input,
      'env_deployment_history 参数校验失败'
    );

    const managerImpl = envManager as {
      getDeploymentHistory: (
        envName: string,
        projectId?: string,
        limit?: number
      ) => Promise<Deployment[]>;
    };
    const deployments = await managerImpl.getDeploymentHistory(
      params.env_name,
      params.project_id,
      params.limit
    );

    return {
      success: true,
      data: deployments,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== env_get_logs ====================

export const envGetLogsSchema = z.object({
  env_name: EnvNameSchema,
  service: z
    .string({
      invalid_type_error: '服务名称必须是字符串类型',
    })
    .optional(),
  lines: z
    .number({
      invalid_type_error: 'lines 必须是数字类型',
    })
    .int('lines 必须是整数')
    .min(1, 'lines 不能小于 1')
    .max(5000, 'lines 不能大于 5000')
    .optional()
    .default(100),
  filter: z
    .string({
      invalid_type_error: '过滤条件必须是字符串类型',
    })
    .optional(),
  project_id: UUIDSchema.optional(),
});

export type EnvGetLogsInput = z.infer<typeof envGetLogsSchema>;

export const env_get_logs = {
  name: 'env_get_logs',
  description: '获取远程服务器的日志，支持按服务筛选和行数限制。',
  inputSchema: envGetLogsSchema.shape,
};

export async function envGetLogsHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ log_lines: string[] }>> {
  try {
    const params = validate(envGetLogsSchema, input, 'env_get_logs 参数校验失败');

    const managerImpl = envManager as {
      getEnvironmentLogs: (
        envName: string,
        service?: string,
        lines?: number,
        filter?: string,
        projectId?: string
      ) => Promise<{ log_lines: string[] }>;
    };
    const result = await managerImpl.getEnvironmentLogs(
      params.env_name,
      params.service,
      params.lines,
      params.filter,
      params.project_id
    );

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

// ==================== env_health_check ====================

export const envHealthCheckSchema = z.object({
  env_name: EnvNameSchema,
  project_id: UUIDSchema.optional(),
});

export type EnvHealthCheckInput = z.infer<typeof envHealthCheckSchema>;

export const env_health_check = {
  name: 'env_health_check',
  description: '执行环境健康检查，包括服务器连通性、服务状态和资源使用率。',
  inputSchema: envHealthCheckSchema.shape,
};

export async function envHealthCheckHandler(
  envManager: EnvManager,
  _projectManager: ProjectManager,
  input: unknown
): Promise<ToolResult<{ healthy: boolean; details: object }>> {
  try {
    const params = validate(envHealthCheckSchema, input, 'env_health_check 参数校验失败');

    const managerImpl = envManager as {
      checkEnvironmentHealth: (
        envName: string,
        projectId?: string
      ) => Promise<{ healthy: boolean; details: object }>;
    };
    const result = await managerImpl.checkEnvironmentHealth(params.env_name, params.project_id);

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

export const envTools = [
  {
    tool: env_list,
    handler: envListHandler,
  },
  {
    tool: env_create,
    handler: envCreateHandler,
  },
  {
    tool: env_info,
    handler: envInfoHandler,
  },
  {
    tool: env_deploy,
    handler: envDeployHandler,
  },
  {
    tool: env_rollback,
    handler: envRollbackHandler,
  },
  {
    tool: env_deployment_history,
    handler: envDeploymentHistoryHandler,
  },
  {
    tool: env_get_logs,
    handler: envGetLogsHandler,
  },
  {
    tool: env_health_check,
    handler: envHealthCheckHandler,
  },
];

/**
 * 注册所有环境管理工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param envManager 环境管理器实例
 * @param projectManager 项目管理器实例
 */
export function registerEnvTools(
  toolRegistry: ToolRegistry,
  envManager: EnvManager,
  projectManager: ProjectManager
): void {
  for (const item of envTools) {
    const handler = async (params: Record<string, unknown>) => {
      return item.handler(envManager, projectManager, params);
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
