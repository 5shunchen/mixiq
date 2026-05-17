import winston from 'winston';
import type { LoggerContext, LogLevel } from '../types';

/**
 * 自定义错误类型：校验错误
 */
export class LoggerError extends Error {
  public readonly context?: LoggerContext;

  constructor(message: string, context?: LoggerContext) {
    super(message);
    this.name = 'LoggerError';
    this.context = context;
    Object.setPrototypeOf(this, LoggerError.prototype);
  }
}

/**
 * 日志级别映射
 */
const LOG_LEVEL_MAP: Record<LogLevel, string> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * 默认日志级别
 */
const DEFAULT_LOG_LEVEL: LogLevel = 'INFO';

/**
 * 获取环境变量配置的日志级别
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.MIXIQ_LOG_LEVEL?.toUpperCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVEL_MAP[envLevel]) {
    return envLevel;
  }
  return DEFAULT_LOG_LEVEL;
}

/**
 * 创建 winston logger 实例
 */
function createLoggerInstance(): winston.Logger {
  const logLevel = getLogLevelFromEnv();

  return winston.createLogger({
    level: LOG_LEVEL_MAP[logLevel],
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      }),
      winston.format.json({
        space: 0,
      })
    ),
    defaultMeta: {
      module: 'unknown',
    },
    transports: [
      new winston.transports.Console({
        stderrLevels: ['error'],
        consoleWarnLevels: ['warn'],
      }),
    ],
  });
}

/**
 * MixIQ 结构化日志工具类
 */
export class Logger {
  private readonly logger: winston.Logger;
  private readonly moduleName: string;
  private readonly baseContext: LoggerContext;

  /**
   * 构造函数
   * @param moduleName 模块名称
   * @param baseContext 基础上下文
   */
  constructor(moduleName: string, baseContext: LoggerContext = {}) {
    this.logger = createLoggerInstance();
    this.moduleName = moduleName;
    this.baseContext = baseContext;
  }

  /**
   * 合并上下文
   */
  private mergeContext(context?: LoggerContext): LoggerContext {
    return { ...this.baseContext, ...context };
  }

  /**
   * 记录 DEBUG 级别日志
   * @param message 日志消息
   * @param context 附加上下文
   */
  public debug(message: string, context?: LoggerContext): void {
    try {
      this.logger.debug(message, {
        module: this.moduleName,
        context: this.mergeContext(context),
      });
    } catch (error) {
      console.error('日志记录失败:', error);
    }
  }

  /**
   * 记录 INFO 级别日志
   * @param message 日志消息
   * @param context 附加上下文
   */
  public info(message: string, context?: LoggerContext): void {
    try {
      this.logger.info(message, {
        module: this.moduleName,
        context: this.mergeContext(context),
      });
    } catch (error) {
      console.error('日志记录失败:', error);
    }
  }

  /**
   * 记录 WARN 级别日志
   * @param message 日志消息
   * @param context 附加上下文
   */
  public warn(message: string, context?: LoggerContext): void {
    try {
      this.logger.warn(message, {
        module: this.moduleName,
        context: this.mergeContext(context),
      });
    } catch (error) {
      console.error('日志记录失败:', error);
    }
  }

  /**
   * 记录 ERROR 级别日志
   * @param message 日志消息
   * @param error 错误对象
   * @param context 附加上下文
   */
  public error(message: string, error?: Error, context?: LoggerContext): void {
    try {
      const errorContext = error
        ? {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
          }
        : {};

      this.logger.error(message, {
        module: this.moduleName,
        context: this.mergeContext({ ...errorContext, ...context }),
      });
    } catch (logError) {
      console.error('日志记录失败:', logError);
    }
  }

  /**
   * 创建子日志器
   * @param subModule 子模块名称
   * @param additionalContext 附加上下文
   */
  public createChild(subModule: string, additionalContext: LoggerContext = {}): Logger {
    const childModule = `${this.moduleName}:${subModule}`;
    const childContext = this.mergeContext(additionalContext);
    return new Logger(childModule, childContext);
  }

  /**
   * 获取当前日志级别
   */
  public getLevel(): LogLevel {
    const currentLevel = this.logger.level;
    return (Object.keys(LOG_LEVEL_MAP) as LogLevel[]).find(
      (level) => LOG_LEVEL_MAP[level] === currentLevel
    ) || DEFAULT_LOG_LEVEL;
  }

  /**
   * 动态设置日志级别
   * @param level 日志级别
   */
  public setLevel(level: LogLevel): void {
    if (LOG_LEVEL_MAP[level]) {
      this.logger.level = LOG_LEVEL_MAP[level];
    }
  }
}

/**
 * 默认全局日志器实例
 */
export const defaultLogger = new Logger('mixiq');

export default Logger;
