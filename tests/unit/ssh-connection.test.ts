import { SSHConnectionPool } from '../../src/ssh/ssh-connection';
import { ServerConfig, SSHConnectionError } from '../../src/types';

// Mock node-ssh 库
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
const mockExecCommand = jest.fn().mockImplementation((cmd: string) => {
  if (cmd === 'echo ping') {
    return Promise.resolve({ stdout: 'ping', stderr: '', code: 0 });
  }
  return Promise.resolve({ stdout: '', stderr: '', code: 0 });
});

jest.mock('node-ssh', () => ({
  NodeSSH: jest.fn(() => ({
    connect: mockConnect,
    dispose: mockDispose,
    execCommand: mockExecCommand,
  })),
  Config: jest.fn(),
}));

describe('SSHConnectionPool', () => {
  const mockServerConfig: ServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    host: 'test.example.com',
    port: 22,
    username: 'testuser',
    password: 'testpass',
  };

  const mockServerConfig2: ServerConfig = {
    id: 'test-server-2',
    name: 'Test Server 2',
    host: 'test2.example.com',
    port: 22,
    username: 'testuser2',
  };

  // 每个测试前重置单例和 Mock
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    SSHConnectionPool.resetInstance();
    // 重置 Mock 实现和调用次数
    mockConnect.mockReset().mockResolvedValue(undefined);
    mockDispose.mockReset();
    mockExecCommand.mockReset().mockImplementation((cmd: string) => {
      if (cmd === 'echo ping') {
        return Promise.resolve({ stdout: 'ping', stderr: '', code: 0 });
      }
      return Promise.resolve({ stdout: '', stderr: '', code: 0 });
    });
  });

  // 每个测试后清理
  afterEach(async () => {
    try {
      const pool = SSHConnectionPool.getInstance();
      await pool.closeAll();
    } catch {
      // 忽略关闭错误
    }
    SSHConnectionPool.resetInstance();
  });

  describe('单例模式', () => {
    it('getInstance 应该返回同一个实例', () => {
      const instance1 = SSHConnectionPool.getInstance();
      const instance2 = SSHConnectionPool.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('首次调用 getInstance 时应该应用配置', () => {
      const config = { maxConnections: 5 };
      const pool = SSHConnectionPool.getInstance(config);

      expect(pool).toBeDefined();
    });

    it('resetInstance 应该重置单例（仅在测试环境）', () => {
      const instance1 = SSHConnectionPool.getInstance();
      SSHConnectionPool.resetInstance();
      const instance2 = SSHConnectionPool.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('非测试环境下 resetInstance 不应该生效', () => {
      process.env.NODE_ENV = 'production';
      const instance1 = SSHConnectionPool.getInstance();
      SSHConnectionPool.resetInstance();
      const instance2 = SSHConnectionPool.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('连接获取', () => {
    it('应该成功创建新连接', async () => {
      const pool = SSHConnectionPool.getInstance();
      const connection = await pool.getConnection(mockServerConfig);

      expect(connection).toBeDefined();
      expect(pool.size).toBe(1);
    });

    it('多次调用 getConnection 应该复用空闲连接', async () => {
      const pool = SSHConnectionPool.getInstance();
      const conn1 = await pool.getConnection(mockServerConfig);
      pool.releaseConnection(mockServerConfig.host);

      const conn2 = await pool.getConnection(mockServerConfig);

      expect(conn1).toBe(conn2);
      expect(pool.size).toBe(1);
    });

    it('不同主机应该创建不同的连接', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);
      await pool.getConnection(mockServerConfig2);

      expect(pool.size).toBe(2);
    });

    it('连接失败应该抛出 SSHConnectionError', async () => {
      const pool = SSHConnectionPool.getInstance({
        maxRetries: 1,
        retryInterval: 10,
      });

      // Mock 连接失败
      mockConnect.mockRejectedValue(new Error('Connection refused'));

      await expect(pool.getConnection(mockServerConfig)).rejects.toThrow(SSHConnectionError);
    });

    it('应该按配置的重试次数进行重试', async () => {
      const pool = SSHConnectionPool.getInstance({
        maxRetries: 3,
        retryInterval: 10,
      });

      const connectionError = new Error('Connection refused');
      mockConnect.mockRejectedValue(connectionError);

      await expect(pool.getConnection(mockServerConfig)).rejects.toThrow();
      // maxRetries = 3，所以应该调用 3 次
      expect(mockConnect).toHaveBeenCalledTimes(3);
    });
  });

  describe('最大连接数限制', () => {
    it('达到最大连接数时应该抛出错误', async () => {
      const pool = SSHConnectionPool.getInstance({
        maxConnections: 2,
        maxRetries: 1,
      });

      // 获取第一个连接
      await pool.getConnection(mockServerConfig);

      // 获取第二个连接（同一主机）
      await pool.getConnection(mockServerConfig);

      // 尝试获取第三个连接，应该失败
      await expect(pool.getConnection(mockServerConfig)).rejects.toThrow(SSHConnectionError);
    });

    it('释放连接后应该可以获取新连接', async () => {
      const pool = SSHConnectionPool.getInstance({
        maxConnections: 1,
        maxRetries: 1,
        retryInterval: 10,
      });

      await pool.getConnection(mockServerConfig);
      pool.releaseConnection(mockServerConfig.host);

      // 释放后应该可以重新获取
      await expect(pool.getConnection(mockServerConfig)).resolves.toBeDefined();
    });

    it('不同主机的连接数限制是独立的', async () => {
      const pool = SSHConnectionPool.getInstance({
        maxConnections: 1,
        maxRetries: 1,
      });

      // 两个不同的主机都应该能获取到连接
      await expect(pool.getConnection(mockServerConfig)).resolves.toBeDefined();
      await expect(pool.getConnection(mockServerConfig2)).resolves.toBeDefined();
      expect(pool.size).toBe(2);
    });
  });

  describe('连接释放', () => {
    it('releaseConnection 应该正确标记连接为空闲', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);

      const statsBefore = pool.getStats();
      expect(statsBefore[mockServerConfig.host]).toBeDefined();
      expect(statsBefore[mockServerConfig.host].inUse).toBe(1);
      expect(statsBefore[mockServerConfig.host].available).toBe(0);

      pool.releaseConnection(mockServerConfig.host);

      const statsAfter = pool.getStats();
      expect(statsAfter[mockServerConfig.host].inUse).toBe(0);
      expect(statsAfter[mockServerConfig.host].available).toBe(1);
    });

    it('释放不存在的主机连接不应报错', () => {
      const pool = SSHConnectionPool.getInstance();
      expect(() => pool.releaseConnection('non-existent-host')).not.toThrow();
    });

    it('释放已经空闲的连接不应报错', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);
      pool.releaseConnection(mockServerConfig.host);

      expect(() => pool.releaseConnection(mockServerConfig.host)).not.toThrow();
    });
  });

  describe('连接池统计信息', () => {
    it('getStats 应该返回正确的统计信息', async () => {
      const pool = SSHConnectionPool.getInstance();

      // 初始状态应该为空
      expect(pool.getStats()).toEqual({});

      // 获取一个连接
      await pool.getConnection(mockServerConfig);

      const stats = pool.getStats();
      expect(stats[mockServerConfig.host]).toBeDefined();
      expect(stats[mockServerConfig.host].total).toBe(1);
      expect(stats[mockServerConfig.host].inUse).toBe(1);
      expect(stats[mockServerConfig.host].available).toBe(0);
    });

    it('size 属性应该返回总连接数', async () => {
      const pool = SSHConnectionPool.getInstance();

      expect(pool.size).toBe(0);

      await pool.getConnection(mockServerConfig);
      expect(pool.size).toBe(1);

      await pool.getConnection(mockServerConfig2);
      expect(pool.size).toBe(2);
    });

    it('关闭连接后统计信息应该更新', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);

      await pool.closeHostConnections(mockServerConfig.host);

      expect(pool.size).toBe(0);
      expect(pool.getStats()).toEqual({});
    });
  });

  describe('连接关闭', () => {
    it('closeHostConnections 应该关闭指定主机的所有连接', async () => {
      const pool = SSHConnectionPool.getInstance({ maxConnections: 2 });
      await pool.getConnection(mockServerConfig);
      await pool.getConnection(mockServerConfig);
      await pool.getConnection(mockServerConfig2);

      expect(pool.size).toBe(3);

      await pool.closeHostConnections(mockServerConfig.host);

      expect(pool.size).toBe(1);
      expect(pool.getStats()[mockServerConfig2.host]).toBeDefined();
    });

    it('关闭不存在的主机不应报错', async () => {
      const pool = SSHConnectionPool.getInstance();
      await expect(pool.closeHostConnections('non-existent-host')).resolves.not.toThrow();
    });

    it('closeAll 应该关闭所有连接', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);
      await pool.getConnection(mockServerConfig2);

      expect(pool.size).toBe(2);

      await pool.closeAll();

      expect(pool.size).toBe(0);
      expect(pool.getStats()).toEqual({});
    });
  });

  describe('连接保活检测', () => {
    it('连接失效时应该重新创建连接', async () => {
      const pool = SSHConnectionPool.getInstance();

      // Mock 第一个连接存活检测失败，第二个成功
      let callCount = 0;
      mockExecCommand.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Connection closed'));
        }
        return Promise.resolve({ stdout: 'ping', stderr: '', code: 0 });
      });

      // 获取第一个连接
      const conn1 = await pool.getConnection(mockServerConfig);
      pool.releaseConnection(mockServerConfig.host);

      // 再次获取，应该重新创建连接
      const conn2 = await pool.getConnection(mockServerConfig);

      expect(conn1).not.toBe(conn2);
    });
  });

  describe('SSH 配置转换', () => {
    it('应该正确转换带密码的服务器配置', async () => {
      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(mockServerConfig);

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: mockServerConfig.host,
          port: mockServerConfig.port,
          username: mockServerConfig.username,
          password: mockServerConfig.password,
        })
      );
    });

    it('应该正确转换带私钥的服务器配置', async () => {
      const configWithKey: ServerConfig = {
        ...mockServerConfig,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
        passphrase: 'secret',
      };

      const pool = SSHConnectionPool.getInstance();
      await pool.getConnection(configWithKey);

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: configWithKey.privateKey,
          passphrase: configWithKey.passphrase,
        })
      );
    });
  });
});
