import type { LoggerContext } from '../types';

/**
 * 自定义错误类型：安全错误
 */
export class SecurityError extends Error {
  public readonly context?: LoggerContext;

  constructor(message: string, context?: LoggerContext) {
    super(message);
    this.name = 'SecurityError';
    this.context = context;
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

/**
 * 默认危险命令黑名单
 */
const DEFAULT_BLACKLIST: readonly string[] = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf /root',
  'mkfs',
  'mkfs.',
  'dd if=',
  'dd if=/dev',
  ':(){ :|:& };:',
  'fork bomb',
  'chmod 777 /',
  'chmod -R 777 /',
  'chown -R /',
  '> /dev/sda',
  'mv /etc',
  'rm /etc/passwd',
  'rm /etc/shadow',
  'format c:',
  'del /f /s /q',
  'rd /s /q',
];

/**
 * 从环境变量获取扩展的黑名单
 */
function getExtendedBlacklist(): string[] {
  const envBlacklist = process.env.MIXIQ_COMMAND_BLACKLIST;
  if (!envBlacklist) {
    return [];
  }

  try {
    const parsed = JSON.parse(envBlacklist);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string');
    }
    return [];
  } catch {
    return envBlacklist.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

/**
 * 获取完整的黑名单列表
 */
function getFullBlacklist(): string[] {
  return [...DEFAULT_BLACKLIST, ...getExtendedBlacklist()];
}

/**
 * 检查命令是否在黑名单中
 * @param command 待检查的命令
 * @returns 是否在黑名单中
 */
export function isDangerousCommand(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  const normalizedCommand = command.toLowerCase().trim();
  const blacklist = getFullBlacklist();

  return blacklist.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase().trim();
    return normalizedCommand.includes(normalizedPattern);
  });
}

/**
 * 校验命令安全性
 * @param command 待校验的命令
 * @throws SecurityError 命令危险时抛出
 */
export function validateCommandSafety(command: string): void {
  if (isDangerousCommand(command)) {
    throw new SecurityError('检测到危险命令，已阻止执行', { command });
  }
}

/**
 * 检查路径是否包含路径穿越
 * @param path 待检查的路径
 * @returns 是否包含路径穿越
 */
export function isPathTraversal(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // 检查常见的路径穿越模式
  const traversalPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e%2f/i,
    /%2e%2e%5c/i,
    /\x2e\x2e\x2f/,
    /\x2e\x2e\x5c/,
  ];

  return traversalPatterns.some((pattern) => pattern.test(path));
}

/**
 * 校验路径安全性
 * @param path 待校验的路径
 * @throws SecurityError 路径包含穿越时抛出
 */
export function validatePathSafety(path: string): void {
  if (isPathTraversal(path)) {
    throw new SecurityError('检测到路径穿越攻击，已阻止访问', { path });
  }
}

/**
 * 敏感信息脱敏正则表达式列表
 */
const SENSITIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // API Key / Token
  { pattern: /(api[_-]?key|token|secret|access[_-]?token)\s*[:=]\s*['"]?[a-zA-Z0-9_\-+=]{10,}['"]?/gi, replacement: '$1=***' },
  // 密码
  { pattern: /(password|passwd|pwd)\s*[:=]\s*['"]?[^'"]{3,}['"]?/gi, replacement: '$1=***' },
  // 私钥
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[^-]*-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gs, replacement: '*** REDACTED PRIVATE KEY ***' },
  // Bearer Token
  { pattern: /bearer\s+[a-zA-Z0-9_\-+.~]{10,}/gi, replacement: 'Bearer ***' },
  // Basic Auth
  { pattern: /basic\s+[a-zA-Z0-9+/=]+/gi, replacement: 'Basic ***' },
  // SSH 密钥（当字符串中）
  { pattern: /(ssh_[a-z_]+)\s+[a-zA-Z0-9+/=]+/gi, replacement: '$1 ***' },
  // URL 中的密码
  { pattern: /(https?:\/\/[^:]+:)[^@]+(@)/g, replacement: '$1***$2' },
];

/**
 * 脱敏敏感信息
 * @param input 输入字符串
 * @returns 脱敏后的字符串
 */
export function redactSensitiveInfo(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let result = input;

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    try {
      result = result.replace(pattern, replacement);
    } catch {
      // 忽略正则表达式错误
    }
  }

  return result;
}

/**
 * 递归脱敏对象中的敏感信息
 * @param obj 输入对象
 * @returns 脱敏后的对象
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSensitiveInfo(obj) as unknown as T;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // 检查键名本身就是敏感字段名，直接脱敏值
      const sensitiveKeys = ['password', 'token', 'secret', 'privateKey', 'passphrase', 'apiKey', 'apitoken', 'accesstoken'];
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        result[key] = '***';
      } else {
        result[key] = redactObject(value);
      }
    }
    return result as T;
  }

  return obj;
}

/**
 * 安全工具类
 */
export class SecurityUtils {
  /**
   * 校验命令安全性
   */
  public static validateCommand(command: string): void {
    validateCommandSafety(command);
  }

  /**
   * 校验路径安全性
   */
  public static validatePath(path: string): void {
    validatePathSafety(path);
  }

  /**
   * 检查命令是否危险
   */
  public static isDangerous(command: string): boolean {
    return isDangerousCommand(command);
  }

  /**
   * 检查路径是否包含穿越
   */
  public static hasPathTraversal(path: string): boolean {
    return isPathTraversal(path);
  }

  /**
   * 脱敏敏感信息
   */
  public static redact(input: string): string {
    return redactSensitiveInfo(input);
  }

  /**
   * 脱敏对象中的敏感信息
   */
  public static redactObject<T>(obj: T): T {
    return redactObject(obj);
  }

  /**
   * 获取当前黑名单列表
   */
  public static getBlacklist(): string[] {
    return [...getFullBlacklist()];
  }
}

export default SecurityUtils;
