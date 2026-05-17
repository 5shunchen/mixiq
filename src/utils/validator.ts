import { z, ZodError, ZodSchema } from 'zod';
import type {
  ServerConfig,
  CommandParameters,
  ValidationResult,
  ValidationErrorDetail,
} from '../types';

/**
 * 自定义错误类型：校验错误
 */
export class ValidationError extends Error {
  public readonly errors: ValidationErrorDetail[];

  constructor(message: string, errors: ValidationErrorDetail[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * UUID 校验 Schema
 */
export const UUIDSchema = z
  .string({
    required_error: 'UUID 不能为空',
    invalid_type_error: 'UUID 必须是字符串类型',
  })
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'UUID 格式不正确，必须符合 UUID v4 格式'
  );

/**
 * 路径校验 Schema
 */
export const PathSchema = z
  .string({
    required_error: '路径不能为空',
    invalid_type_error: '路径必须是字符串类型',
  })
  .min(1, '路径长度不能小于 1')
  .refine(
    (path) => !path.includes('..'),
    '路径不能包含目录遍历符 ".."'
  )
  .refine(
    (path) => !path.includes('\0'),
    '路径不能包含空字符'
  );

/**
 * 主机地址校验 Schema
 */
export const HostSchema = z
  .string({
    required_error: '主机地址不能为空',
    invalid_type_error: '主机地址必须是字符串类型',
  })
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-._]*[a-zA-Z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/,
    '主机地址格式不正确，必须是有效的域名或 IP 地址'
  );

/**
 * 端口号校验 Schema
 */
export const PortSchema = z
  .number({
    required_error: '端口号不能为空',
    invalid_type_error: '端口号必须是数字类型',
  })
  .int('端口号必须是整数')
  .min(1, '端口号不能小于 1')
  .max(65535, '端口号不能大于 65535');

/**
 * 用户名校验 Schema
 */
export const UsernameSchema = z
  .string({
    required_error: '用户名不能为空',
    invalid_type_error: '用户名必须是字符串类型',
  })
  .min(1, '用户名长度不能小于 1')
  .max(255, '用户名长度不能大于 255');

/**
 * 服务器配置校验 Schema
 */
export const ServerConfigSchema: z.ZodSchema<ServerConfig> = z.object({
  id: UUIDSchema,
  name: z
    .string({
      required_error: '服务器名称不能为空',
      invalid_type_error: '服务器名称必须是字符串类型',
    })
    .min(1, '服务器名称长度不能小于 1')
    .max(255, '服务器名称长度不能大于 255'),
  host: HostSchema,
  port: PortSchema,
  username: UsernameSchema,
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
});

/**
 * 命令参数校验 Schema
 */
export const CommandParametersSchema: z.ZodSchema<CommandParameters> = z.object({
  command: z
    .string({
      required_error: '命令不能为空',
      invalid_type_error: '命令必须是字符串类型',
    })
    .min(1, '命令长度不能小于 1'),
  args: z.array(z.string()).optional(),
  timeout: z.number().int().min(0).max(3600000).optional(),
  workingDirectory: PathSchema.optional(),
});

/**
 * 将 Zod 错误转换为校验错误详情
 */
function transformZodError(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * 通用校验函数
 * @param schema Zod 校验 Schema
 * @param data 待校验数据
 * @param errorMessage 错误前缀
 * @returns 校验结果
 * @throws ValidationError 校验失败时抛出
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  errorMessage = '参数校验失败'
): T {
  try {
    const result = schema.safeParse(data);

    if (!result.success) {
      const errors = transformZodError(result.error);
      const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new ValidationError(`${errorMessage}: ${errorMessages}`, errors);
    }

    return result.data;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`校验过程发生错误: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 安全校验函数（不抛出异常）
 * @param schema Zod 校验 Schema
 * @param data 待校验数据
 * @returns 校验结果
 */
export function safeValidate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);

    if (!result.success) {
      const errors = transformZodError(result.error);
      return {
        success: false,
        errors,
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          field: 'unknown',
          message: `校验过程发生错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * UUID 校验
 */
export function validateUUID(uuid: unknown): string {
  return validate(UUIDSchema, uuid, 'UUID 校验失败');
}

/**
 * 路径校验
 */
export function validatePath(path: unknown): string {
  return validate(PathSchema, path, '路径校验失败');
}

/**
 * 服务器配置校验
 */
export function validateServerConfig(config: unknown): ServerConfig {
  return validate(ServerConfigSchema, config, '服务器配置校验失败');
}

/**
 * 命令参数校验
 */
export function validateCommandParameters(params: unknown): CommandParameters {
  return validate(CommandParametersSchema, params, '命令参数校验失败');
}

export { z, ZodSchema, ZodError };
