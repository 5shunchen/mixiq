import { z } from 'zod';
import { validate } from '../utils/validator';

// 使用类型断言来避免类型冲突
export type SSHExecutor = unknown;

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ==================== execute_remote ====================

export const executeRemoteSchema = z.object({
  server: z.object({
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
      .max(65535, '端口号不能大于 65535')
      .default(22),
    username: z
      .string({
        required_error: '用户名不能为空',
        invalid_type_error: '用户名必须是字符串类型',
      })
      .min(1, '用户名长度不能小于 1'),
    private_key_path: z
      .string({
        invalid_type_error: '私钥路径必须是字符串类型',
      })
      .optional(),
  }),
  command: z
    .string({
      required_error: '命令不能为空',
      invalid_type_error: '命令必须是字符串类型',
    })
    .min(1, '命令长度不能小于 1'),
  work_dir: z
    .string({
      invalid_type_error: '工作目录必须是字符串类型',
    })
    .refine((path) => !path.includes('..'), '路径不能包含目录遍历符 ".."')
    .optional(),
});

export type ExecuteRemoteInput = z.infer<typeof executeRemoteSchema>;

export const execute_remote = {
  name: 'execute_remote',
  description: '在指定的远程服务器上执行 Shell 命令。命令会经过安全过滤，危险命令（如 rm -rf /、mkfs 等）将被拒绝执行。',
  inputSchema: executeRemoteSchema.shape,
};

export async function executeRemoteHandler(
  executor: SSHExecutor,
  input: unknown
): Promise<ToolResult<{ stdout: string; stderr: string; exitCode: number }>> {
  try {
    const params = validate(executeRemoteSchema, input, 'execute_remote 参数校验失败');

    const server = {
      host: params.server.host,
      port: params.server.port ?? 22,
      username: params.server.username,
      privateKeyPath: params.server.private_key_path || '',
    };

    const executorImpl = executor as {
      execute: (server: unknown, command: string, workDir?: string) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
      }>;
    };
    const result = await executorImpl.execute(server, params.command, params.work_dir);

    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== sync_code ====================

export const syncCodeSchema = z.object({
  server: z.object({
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
      .max(65535, '端口号不能大于 65535')
      .default(22),
    username: z
      .string({
        required_error: '用户名不能为空',
        invalid_type_error: '用户名必须是字符串类型',
      })
      .min(1, '用户名长度不能小于 1'),
    private_key_path: z
      .string({
        invalid_type_error: '私钥路径必须是字符串类型',
      })
      .optional(),
  }),
  local_path: z
    .string({
      required_error: '本地路径不能为空',
      invalid_type_error: '本地路径必须是字符串类型',
    })
    .min(1, '本地路径长度不能小于 1')
    .refine((path) => !path.includes('..'), '本地路径不能包含目录遍历符 ".."'),
  remote_path: z
    .string({
      required_error: '远程路径不能为空',
      invalid_type_error: '远程路径必须是字符串类型',
    })
    .min(1, '远程路径长度不能小于 1')
    .refine((path) => !path.includes('..'), '远程路径不能包含目录遍历符 ".."'),
  direction: z
    .enum(['local-to-remote', 'remote-to-local'], {
      required_error: '同步方向不能为空',
      invalid_type_error: '同步方向必须是 local-to-remote 或 remote-to-local',
    }),
});

export type SyncCodeInput = z.infer<typeof syncCodeSchema>;

export const sync_code = {
  name: 'sync_code',
  description: '在本地和远程服务器之间同步文件。支持两个方向：local-to-remote（将本地文件推送到远程）和 remote-to-local（从远程拉取文件到本地）。基于 rsync 协议实现增量同步。',
  inputSchema: syncCodeSchema.shape,
};

export async function syncCodeHandler(
  executor: SSHExecutor,
  input: unknown
): Promise<ToolResult<{ synced_files: string[]; errors: string[] }>> {
  try {
    const params = validate(syncCodeSchema, input, 'sync_code 参数校验失败');

    const server = {
      host: params.server.host,
      port: params.server.port ?? 22,
      username: params.server.username,
      privateKeyPath: params.server.private_key_path || '',
    };

    const executorImpl = executor as {
      syncFiles: (
        server: unknown,
        localPath: string,
        remotePath: string,
        direction: 'local-to-remote' | 'remote-to-local'
      ) => Promise<{
        synced_files: string[];
        errors: string[];
      }>;
    };
    const result = await executorImpl.syncFiles(
      server,
      params.local_path,
      params.remote_path,
      params.direction
    );

    return {
      success: true,
      data: {
        synced_files: result.synced_files,
        errors: result.errors,
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

export const executeTools = [
  {
    tool: execute_remote,
    handler: executeRemoteHandler,
  },
  {
    tool: sync_code,
    handler: syncCodeHandler,
  },
];

/**
 * 注册所有命令执行工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param sshExecutor SSH 执行器实例
 */
export function registerExecuteTools(
  toolRegistry: ToolRegistry,
  sshExecutor: SSHExecutor
): void {
  for (const item of executeTools) {
    const handler = async (params: Record<string, unknown>) => {
      return item.handler(sshExecutor, params);
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
