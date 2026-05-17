import {
  validate,
  safeValidate,
  validateUUID,
  validatePath,
  validateServerConfig,
  validateCommandParameters,
  ValidationError,
  UUIDSchema,
  PathSchema,
  ServerConfigSchema,
  CommandParametersSchema,
  z,
} from '../../src/utils/validator';
import type { ServerConfig, CommandParameters } from '../../src/types';

describe('Validator - 参数校验工具测试', () => {
  describe('UUID 校验', () => {
    it('应该接受有效的 UUID v4 格式', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '123e4567-e89b-12d3-a456-426614174000',
        '550e8400-E29B-41D4-A716-446655440000', // 大写
      ];

      validUUIDs.forEach((uuid) => {
        expect(() => validateUUID(uuid)).not.toThrow();
        expect(validateUUID(uuid)).toBe(uuid);
      });
    });

    it('应该拒绝无效的 UUID 格式', () => {
      const invalidUUIDs = [
        '',
        null,
        undefined,
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // 不完整
        '550e8400-e29b-41d4-a716-446655440000-extra', // 额外字符
        '550e8400e29b41d4a716446655440000', // 没有连字符
        123, // 数字类型
        {},
      ];

      invalidUUIDs.forEach((uuid) => {
        expect(() => validateUUID(uuid)).toThrow(ValidationError);
      });
    });

    it('UUID 为空时应该返回正确的错误消息', () => {
      try {
        validateUUID('');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('UUID 校验失败');
        expect((error as ValidationError).errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ message: expect.any(String) }),
          ])
        );
      }
    });

    it('UUID 类型不是字符串时应该返回正确的错误消息', () => {
      try {
        validateUUID(123);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('必须是字符串类型');
      }
    });
  });

  describe('路径校验', () => {
    it('应该接受有效的路径', () => {
      const validPaths = [
        '/home/user/docs',
        './relative/path',
        'folder/subfolder/file.txt',
        'C:\\Windows\\System32',
        '/',
        'a',
      ];

      validPaths.forEach((path) => {
        expect(() => validatePath(path)).not.toThrow();
        expect(validatePath(path)).toBe(path);
      });
    });

    it('应该拒绝包含目录遍历符的路径', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '/var/../etc/passwd',
        './../secret',
        '..\\..\\windows\\system32',
      ];

      traversalPaths.forEach((path) => {
        expect(() => validatePath(path)).toThrow(ValidationError);
      });
    });

    it('应该拒绝包含空字符的路径', () => {
      expect(() => validatePath('/etc/passwd\0')).toThrow(ValidationError);
    });

    it('应该拒绝空路径', () => {
      expect(() => validatePath('')).toThrow(ValidationError);
      expect(() => validatePath(null)).toThrow(ValidationError);
      expect(() => validatePath(undefined)).toThrow(ValidationError);
    });

    it('路径包含 ".." 时应该返回正确的错误消息', () => {
      try {
        validatePath('../etc/passwd');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('路径不能包含目录遍历符');
      }
    });
  });

  describe('服务器配置校验', () => {
    const validConfig: ServerConfig = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: '生产服务器',
      host: '192.168.1.1',
      port: 22,
      username: 'root',
    };

    it('应该接受有效的服务器配置', () => {
      expect(() => validateServerConfig(validConfig)).not.toThrow();
      expect(validateServerConfig(validConfig)).toEqual(validConfig);
    });

    it('应该拒绝缺少必需字段的配置', () => {
      const invalidConfigs = [
        { ...validConfig, id: undefined },
        { ...validConfig, name: undefined },
        { ...validConfig, host: undefined },
        { ...validConfig, port: undefined },
        { ...validConfig, username: undefined },
        {},
      ];

      invalidConfigs.forEach((config) => {
        expect(() => validateServerConfig(config)).toThrow(ValidationError);
      });
    });

    it('应该验证主机地址格式', () => {
      const validHosts = ['localhost', 'example.com', '192.168.1.1', 'api.example.com'];
      const invalidHosts = ['', ' ', '-invalid', 'invalid-', '@invalid'];

      validHosts.forEach((host) => {
        expect(() => validateServerConfig({ ...validConfig, host })).not.toThrow();
      });

      invalidHosts.forEach((host) => {
        expect(() => validateServerConfig({ ...validConfig, host })).toThrow(ValidationError);
      });
    });

    it('应该验证端口号范围', () => {
      const validPorts = [1, 22, 80, 443, 65535];
      const invalidPorts = [0, -1, 65536, 1.5, '22'];

      validPorts.forEach((port) => {
        expect(() => validateServerConfig({ ...validConfig, port })).not.toThrow();
      });

      invalidPorts.forEach((port) => {
        // 测试无效端口值（数字范围错误）和类型错误
        if (typeof port === 'number') {
          expect(() => validateServerConfig({ ...validConfig, port })).toThrow(ValidationError);
        } else {
          // 字符串类型的端口号应该在运行时被 Zod 校验捕获
          // @ts-ignore 故意使用错误类型测试运行时校验
          expect(() => validateServerConfig({ ...validConfig, port })).toThrow(ValidationError);
        }
      });
    });

    it('应该接受可选字段（密码、私钥、密码短语）', () => {
      const configWithPassword = { ...validConfig, password: 'secret' };
      const configWithPrivateKey = { ...validConfig, privateKey: '-----BEGIN RSA...' };
      const configWithPassphrase = { ...validConfig, passphrase: 'phrase' };

      expect(() => validateServerConfig(configWithPassword)).not.toThrow();
      expect(() => validateServerConfig(configWithPrivateKey)).not.toThrow();
      expect(() => validateServerConfig(configWithPassphrase)).not.toThrow();
    });

    it('服务器名称长度应该在有效范围内', () => {
      const configWithShortName = { ...validConfig, name: '' };
      const configWithLongName = { ...validConfig, name: 'a'.repeat(256) };

      expect(() => validateServerConfig(configWithShortName)).toThrow(ValidationError);
      expect(() => validateServerConfig(configWithLongName)).toThrow(ValidationError);
    });
  });

  describe('命令参数校验', () => {
    const validParams: CommandParameters = {
      command: 'ls',
    };

    it('应该接受有效的命令参数', () => {
      expect(() => validateCommandParameters(validParams)).not.toThrow();
      expect(validateCommandParameters(validParams)).toEqual(validParams);
    });

    it('应该拒绝空命令', () => {
      expect(() => validateCommandParameters({ command: '' })).toThrow(ValidationError);
      expect(() => validateCommandParameters({})).toThrow(ValidationError);
    });

    it('应该接受可选的参数数组', () => {
      const paramsWithArgs = { command: 'ls', args: ['-la', '/home'] };
      expect(() => validateCommandParameters(paramsWithArgs)).not.toThrow();
    });

    it('应该接受可选的超时参数', () => {
      const validTimeouts = [0, 1000, 3600000];
      const invalidTimeouts = [-1, 3600001, 1.5];

      validTimeouts.forEach((timeout) => {
        expect(() => validateCommandParameters({ command: 'ls', timeout })).not.toThrow();
      });

      invalidTimeouts.forEach((timeout) => {
        expect(() => validateCommandParameters({ command: 'ls', timeout })).toThrow(ValidationError);
      });
    });

    it('应该验证工作目录路径', () => {
      const paramsWithValidPath = { command: 'ls', workingDirectory: '/home/user' };
      const paramsWithInvalidPath = { command: 'ls', workingDirectory: '../../../etc' };

      expect(() => validateCommandParameters(paramsWithValidPath)).not.toThrow();
      expect(() => validateCommandParameters(paramsWithInvalidPath)).toThrow(ValidationError);
    });

    it('命令类型不是字符串时应该返回错误', () => {
      // @ts-ignore 故意使用错误类型测试运行时校验
      expect(() => validateCommandParameters({ command: 123 })).toThrow(ValidationError);
    });
  });

  describe('ValidationError 抛出', () => {
    it('应该正确创建 ValidationError 实例', () => {
      const errors = [{ field: 'name', message: '名称不能为空' }];
      const error = new ValidationError('校验失败', errors);

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('校验失败');
      expect(error.errors).toEqual(errors);
    });

    it('ValidationError 应该是 Error 的子类', () => {
      const error = new ValidationError('测试错误');
      expect(error).toBeInstanceOf(Error);
    });

    it('校验失败时应该抛出包含错误详情的 ValidationError', () => {
      try {
        validate(UUIDSchema, 'invalid-uuid', 'UUID 校验失败');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: expect.any(String),
              message: expect.any(String),
            }),
          ])
        );
      }
    });

    it('应该包含所有校验错误的详细信息', () => {
      try {
        validateServerConfig({
          id: 'invalid',
          name: '',
          host: '',
          port: 99999,
          username: '',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.errors.length).toBeGreaterThan(1);
      }
    });
  });

  describe('通用校验函数 validate', () => {
    const schema = z.object({ name: z.string().min(1) });

    it('校验通过时应该返回解析后的数据', () => {
      const result = validate(schema, { name: 'test' });
      expect(result).toEqual({ name: 'test' });
    });

    it('校验失败时应该抛出 ValidationError', () => {
      expect(() => validate(schema, { name: '' })).toThrow(ValidationError);
    });

    it('应该支持自定义错误消息前缀', () => {
      try {
        validate(schema, { name: '' }, '自定义前缀');
      } catch (error) {
        expect((error as ValidationError).message).toContain('自定义前缀');
      }
    });

    it('应该处理校验过程中发生的异常', () => {
      const badSchema = {
        safeParse: () => {
          throw new Error('意外错误');
        },
      };
      // @ts-expect-error 测试异常处理
      expect(() => validate(badSchema, {})).toThrow(ValidationError);
    });
  });

  describe('安全校验函数 safeValidate', () => {
    const schema = z.object({ name: z.string().min(1) });

    it('校验通过时应该返回 success=true', () => {
      const result = safeValidate(schema, { name: 'test' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('校验失败时应该返回 success=false 和错误详情', () => {
      const result = safeValidate(schema, { name: '' });
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ])
      );
    });

    it('不应该抛出异常', () => {
      expect(() => safeValidate(schema, { name: '' })).not.toThrow();
    });

    it('应该处理校验过程中发生的异常', () => {
      const badSchema = {
        safeParse: () => {
          throw new Error('意外错误');
        },
      };
      // @ts-expect-error 测试异常处理
      const result = safeValidate(badSchema, {});
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'unknown',
            message: expect.any(String),
          }),
        ])
      );
    });
  });

  describe('Schema 导出', () => {
    it('应该导出 Zod 核心对象', () => {
      expect(z).toBeDefined();
      expect(z.object).toBeDefined();
      expect(z.string).toBeDefined();
    });

    it('应该导出所有预定义的 Schema', () => {
      expect(UUIDSchema).toBeDefined();
      expect(PathSchema).toBeDefined();
      expect(ServerConfigSchema).toBeDefined();
      expect(CommandParametersSchema).toBeDefined();
    });
  });

  describe('字段错误详情', () => {
    it('错误详情应该包含字段名', () => {
      const result = safeValidate(z.object({ username: z.string().min(1) }), { username: '' });
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('username');
    });

    it('嵌套对象的错误字段应该使用点号分隔', () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().min(1),
        }),
      });
      const result = safeValidate(nestedSchema, { user: { name: '' } });
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('user.name');
    });
  });
});
