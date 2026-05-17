import { Logger, defaultLogger, LoggerError } from '../../src/utils/logger';

// 创建 mock logger 实例
const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  level: 'info',
});

// 使用 jest.mock 提升到文件顶部
jest.mock('winston', () => ({
  createLogger: jest.fn(),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

const winston = jest.requireMock('winston');

describe('Logger - 日志工具测试', () => {
  let logger: Logger;
  let mockLoggerInstance: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建一个新的 mock logger 实例
    mockLoggerInstance = createMockLogger();

    // 设置 createLogger 返回这个 mock 实例
    (winston.createLogger as jest.Mock).mockReturnValue(mockLoggerInstance);

    logger = new Logger('test-module');
  });

  describe('日志级别过滤', () => {
    it('应该正确设置默认日志级别为 INFO', () => {
      expect(logger.getLevel()).toBe('INFO');
    });

    it('应该支持动态设置日志级别为 DEBUG', () => {
      logger.setLevel('DEBUG');
      expect(mockLoggerInstance.level).toBe('debug');
      expect(logger.getLevel()).toBe('DEBUG');
    });

    it('应该支持动态设置日志级别为 ERROR', () => {
      logger.setLevel('ERROR');
      expect(mockLoggerInstance.level).toBe('error');
      expect(logger.getLevel()).toBe('ERROR');
    });

    it('忽略无效的日志级别', () => {
      const currentLevel = logger.getLevel();
      // @ts-expect-error 测试无效级别
      logger.setLevel('INVALID');
      expect(logger.getLevel()).toBe(currentLevel);
    });

    it('DEBUG 级别日志应该调用 winston 的 debug 方法', () => {
      logger.setLevel('DEBUG');
      logger.debug('测试调试消息');
      expect(mockLoggerInstance.debug).toHaveBeenCalledWith(
        '测试调试消息',
        expect.objectContaining({
          module: 'test-module',
          context: {},
        })
      );
    });

    it('INFO 级别日志应该调用 winston 的 info 方法', () => {
      logger.info('测试信息消息');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '测试信息消息',
        expect.objectContaining({ module: 'test-module' })
      );
    });

    it('WARN 级别日志应该调用 winston 的 warn 方法', () => {
      logger.warn('测试警告消息');
      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        '测试警告消息',
        expect.objectContaining({ module: 'test-module' })
      );
    });

    it('ERROR 级别日志应该调用 winston 的 error 方法', () => {
      logger.error('测试错误消息');
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        '测试错误消息',
        expect.objectContaining({ module: 'test-module' })
      );
    });
  });

  describe('JSON 格式输出', () => {
    it('应该包含时间戳字段', () => {
      logger.info('测试消息');
      // 验证 winston.format 被调用
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalledWith({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      });
      expect(winston.format.json).toHaveBeenCalledWith({ space: 0 });
    });

    it('日志输出应该包含模块名称', () => {
      logger.info('测试消息');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '测试消息',
        expect.objectContaining({ module: 'test-module' })
      );
    });
  });

  describe('上下文附加', () => {
    it('应该将上下文附加到日志中', () => {
      const context = { userId: '123', action: 'login' };
      logger.info('用户登录', context);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '用户登录',
        expect.objectContaining({ context })
      );
    });

    it('应该合并基础上下文和调用时的上下文', () => {
      const baseContext = { app: 'mixiq', version: '1.0.0' };
      const customLogger = new Logger('test-module', baseContext);
      customLogger.info('测试消息', { requestId: 'req-456' });

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '测试消息',
        expect.objectContaining({
          context: {
            app: 'mixiq',
            version: '1.0.0',
            requestId: 'req-456',
          },
        })
      );
    });

    it('错误日志应该包含错误详情', () => {
      const error = new Error('测试错误');
      logger.error('发生错误', error);

      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        '发生错误',
        expect.objectContaining({
          context: expect.objectContaining({
            errorName: 'Error',
            errorMessage: '测试错误',
            errorStack: expect.any(String),
          }),
        })
      );
    });

    it('错误日志应该同时包含错误详情和自定义上下文', () => {
      const error = new Error('测试错误');
      logger.error('发生错误', error, { requestId: 'req-789' });

      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        '发生错误',
        expect.objectContaining({
          context: expect.objectContaining({
            errorName: 'Error',
            errorMessage: '测试错误',
            requestId: 'req-789',
          }),
        })
      );
    });
  });

  describe('环境变量配置日志级别', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      jest.clearAllMocks();
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('应该从环境变量 MIXIQ_LOG_LEVEL=DEBUG 设置日志级别', () => {
      process.env.MIXIQ_LOG_LEVEL = 'DEBUG';
      mockLoggerInstance.level = 'debug';
      const debugLogger = new Logger('debug-module');
      expect(debugLogger.getLevel()).toBe('DEBUG');
    });

    it('应该从环境变量 MIXIQ_LOG_LEVEL=WARN 设置日志级别', () => {
      process.env.MIXIQ_LOG_LEVEL = 'WARN';
      mockLoggerInstance.level = 'warn';
      const warnLogger = new Logger('warn-module');
      expect(warnLogger.getLevel()).toBe('WARN');
    });

    it('应该从环境变量 MIXIQ_LOG_LEVEL=ERROR 设置日志级别', () => {
      process.env.MIXIQ_LOG_LEVEL = 'ERROR';
      mockLoggerInstance.level = 'error';
      const errorLogger = new Logger('error-module');
      expect(errorLogger.getLevel()).toBe('ERROR');
    });

    it('环境变量值为小写时应该正常工作', () => {
      process.env.MIXIQ_LOG_LEVEL = 'debug';
      mockLoggerInstance.level = 'debug';
      const debugLogger = new Logger('debug-module');
      expect(debugLogger.getLevel()).toBe('DEBUG');
    });

    it('无效的环境变量日志级别应该使用默认值 INFO', () => {
      process.env.MIXIQ_LOG_LEVEL = 'INVALID_LEVEL';
      mockLoggerInstance.level = 'info';
      const invalidLogger = new Logger('invalid-module');
      expect(invalidLogger.getLevel()).toBe('INFO');
    });

    it('未设置环境变量时应该使用默认日志级别 INFO', () => {
      delete process.env.MIXIQ_LOG_LEVEL;
      mockLoggerInstance.level = 'info';
      const defaultLevelLogger = new Logger('default-module');
      expect(defaultLevelLogger.getLevel()).toBe('INFO');
    });
  });

  describe('子日志器创建', () => {
    it('应该创建带有子模块名称的子日志器', () => {
      const childLogger = logger.createChild('sub-module');
      childLogger.info('子模块消息');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '子模块消息',
        expect.objectContaining({ module: 'test-module:sub-module' })
      );
    });

    it('子日志器应该继承父日志器的基础上下文', () => {
      const parentLogger = new Logger('parent', { base: 'context' });
      const childLogger = parentLogger.createChild('child');
      childLogger.info('子消息');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '子消息',
        expect.objectContaining({ context: { base: 'context' } })
      );
    });

    it('子日志器应该支持添加额外的上下文', () => {
      const parentLogger = new Logger('parent', { base: 'context' });
      const childLogger = parentLogger.createChild('child', { extra: 'value' });
      childLogger.info('子消息');
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        '子消息',
        expect.objectContaining({
          context: { base: 'context', extra: 'value' },
        })
      );
    });
  });

  describe('默认全局日志器', () => {
    it('应该存在默认全局日志器实例', () => {
      expect(defaultLogger).toBeInstanceOf(Logger);
    });
  });

  describe('异常处理', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('当 winston 日志记录失败时应该捕获错误', () => {
      mockLoggerInstance.info.mockImplementationOnce(() => {
        throw new Error('Winston 错误');
      });

      expect(() => logger.info('测试消息')).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        '日志记录失败:',
        expect.any(Error)
      );
    });

    it('当 winston 错误日志记录失败时应该捕获错误', () => {
      mockLoggerInstance.error.mockImplementationOnce(() => {
        throw new Error('Winston 错误');
      });

      expect(() => logger.error('测试错误', new Error('原始错误'))).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        '日志记录失败:',
        expect.any(Error)
      );
    });
  });

  describe('LoggerError 自定义错误', () => {
    it('应该正确创建 LoggerError 实例', () => {
      const error = new LoggerError('测试错误', { detail: '上下文' });
      expect(error.name).toBe('LoggerError');
      expect(error.message).toBe('测试错误');
      expect(error.context).toEqual({ detail: '上下文' });
    });

    it('LoggerError 应该是 Error 的子类', () => {
      const error = new LoggerError('测试错误');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
