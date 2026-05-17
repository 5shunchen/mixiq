import { NodeSSH, Config as SSHConfig } from 'node-ssh';
import type { ServerConfig, SSHPoolConfig, PooledSSHConnection, LoggerContext } from '../types';
import { SSHConnectionError } from '../types';
import { Logger } from '../utils/logger';

const logger = new Logger('ssh-connection');

/**
 * 默认连接池配置
 */
const DEFAULT_POOL_CONFIG: SSHPoolConfig = {
  maxConnections: parseInt(process.env.MIXIQ_MAX_SSH_CONNECTIONS || '10', 10),
  connectionTimeout: parseInt(process.env.MIXIQ_SSH_TIMEOUT || '30000', 10),
  maxRetries: 3,
  retryInterval: 5000,
};

/**
 * SSH 连接池管理类
 * 提供连接复用、自动重连、超时控制等功能
 */
export class SSHConnectionPool {
  private static instance: SSHConnectionPool;
  private readonly pool: Map<string, PooledSSHConnection[]>;
  private readonly config: SSHPoolConfig;

  private constructor(config: Partial<SSHPoolConfig> = {}) {
    this.pool = new Map();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * 获取连接池单例
   */
  public static getInstance(config?: Partial<SSHPoolConfig>): SSHConnectionPool {
    if (!SSHConnectionPool.instance) {
      SSHConnectionPool.instance = new SSHConnectionPool(config);
    }
    return SSHConnectionPool.instance;
  }

  /**
   * 将服务器配置转换为 node-ssh 配置
   */
  private toSSHConfig(serverConfig: ServerConfig): SSHConfig {
    const config: SSHConfig = {
      host: serverConfig.host,
      port: serverConfig.port,
      username: serverConfig.username,
      readyTimeout: this.config.connectionTimeout,
    };

    if (serverConfig.password) {
      config.password = serverConfig.password;
    }

    if (serverConfig.privateKey) {
      config.privateKey = serverConfig.privateKey;
    }

    if (serverConfig.passphrase) {
      config.passphrase = serverConfig.passphrase;
    }

    return config;
  }

  /**
   * 等待指定毫秒数
   */
  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 建立新的 SSH 连接（带重试）
   */
  private async createConnection(serverConfig: ServerConfig): Promise<NodeSSH> {
    const sshConfig = this.toSSHConfig(serverConfig);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const ssh = new NodeSSH();
        logger.debug(`尝试建立 SSH 连接`, {
          host: serverConfig.host,
          attempt,
          maxRetries: this.config.maxRetries,
        });

        await ssh.connect(sshConfig);

        logger.info(`SSH 连接建立成功`, {
          host: serverConfig.host,
          attempt,
        });

        return ssh;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`SSH 连接失败`, {
          host: serverConfig.host,
          attempt,
          maxRetries: this.config.maxRetries,
          errorMessage: lastError.message,
        });

        if (attempt < this.config.maxRetries) {
          await this.wait(this.config.retryInterval);
        }
      }
    }

    const context: LoggerContext = {
      host: serverConfig.host,
      maxRetries: this.config.maxRetries,
    };

    const error = new SSHConnectionError(
      `SSH 连接失败，已重试 ${this.config.maxRetries} 次: ${lastError?.message || '未知错误'}`,
      serverConfig.host,
      context
    );
    throw error;
  }

  /**
   * 获取可用连接
   * @param host 服务器地址
   * @returns 可用连接或 null
   */
  private getAvailableConnection(host: string): PooledSSHConnection | null {
    const hostConnections = this.pool.get(host);
    if (!hostConnections) {
      return null;
    }

    const available = hostConnections.find((conn) => !conn.inUse);
    return available || null;
  }

  /**
   * 检查连接是否仍然有效
   */
  private async isConnectionAlive(ssh: NodeSSH): Promise<boolean> {
    try {
      const result = await ssh.execCommand('echo ping', {
        execOptions: { timeout: 5000 },
      });
      return result.stdout.trim() === 'ping';
    } catch {
      return false;
    }
  }

  /**
   * 获取或创建 SSH 连接
   * @param serverConfig 服务器配置
   * @returns SSH 连接实例
   * @throws SSHConnectionError 连接失败时抛出
   */
  public async getConnection(serverConfig: ServerConfig): Promise<NodeSSH> {
    const host = serverConfig.host;

    // 尝试获取可用连接
    const availableConn = this.getAvailableConnection(host);
    if (availableConn) {
      // 检查连接是否仍然存活
      const isAlive = await this.isConnectionAlive(availableConn.instance as NodeSSH);
      if (isAlive) {
        availableConn.inUse = true;
        availableConn.lastUsed = new Date();
        logger.debug(`复用现有 SSH 连接`, { host });
        return availableConn.instance as NodeSSH;
      }

      // 连接已失效，从池中移除
      logger.warn(`SSH 连接已失效，将重新连接`, { host });
      await this.removeConnection(host, availableConn);
    }

    // 检查是否达到最大连接数
    const hostConnections = this.pool.get(host) || [];
    if (hostConnections.length >= this.config.maxConnections) {
      const error = new SSHConnectionError(
        `SSH 连接数已达上限 (${this.config.maxConnections})`,
        host,
        { maxConnections: this.config.maxConnections }
      );
      throw error;
    }

    // 创建新连接
    const newSSH = await this.createConnection(serverConfig);
    const pooledConn: PooledSSHConnection = {
      instance: newSSH,
      host,
      lastUsed: new Date(),
      inUse: true,
    };

    if (!this.pool.has(host)) {
      this.pool.set(host, []);
    }
    this.pool.get(host)!.push(pooledConn);

    logger.debug(`新连接已加入连接池`, {
      host,
      currentConnections: this.pool.get(host)!.length,
      maxConnections: this.config.maxConnections,
    });

    return newSSH;
  }

  /**
   * 从连接池中移除指定连接
   */
  private async removeConnection(host: string, conn: PooledSSHConnection): Promise<void> {
    try {
      (conn.instance as NodeSSH).dispose();
    } catch (error) {
      logger.warn(`关闭 SSH 连接时发生错误`, {
        host,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    const hostConnections = this.pool.get(host);
    if (hostConnections) {
      const index = hostConnections.indexOf(conn);
      if (index > -1) {
        hostConnections.splice(index, 1);
      }

      if (hostConnections.length === 0) {
        this.pool.delete(host);
      }
    }
  }

  /**
   * 释放连接回到池中
   * @param host 服务器地址
   */
  public releaseConnection(host: string): void {
    const hostConnections = this.pool.get(host);
    if (!hostConnections) {
      logger.debug(`未找到该主机的连接，无需释放`, { host });
      return;
    }

    let released = false;
    for (const conn of hostConnections) {
      if (conn.inUse) {
        conn.inUse = false;
        released = true;
        logger.debug(`SSH 连接已释放回连接池`, { host });
        break;
      }
    }

    if (!released) {
      logger.debug(`该主机没有正在使用的连接`, { host });
    }
  }

  /**
   * 关闭指定主机的所有连接
   * @param host 服务器地址
   */
  public async closeHostConnections(host: string): Promise<void> {
    const hostConnections = this.pool.get(host);
    if (!hostConnections) {
      return;
    }

    logger.info(`正在关闭主机的所有 SSH 连接`, {
      host,
      connectionCount: hostConnections.length,
    });

    for (const conn of [...hostConnections]) {
      await this.removeConnection(host, conn);
    }

    logger.info(`主机的 SSH 连接已全部关闭`, { host });
  }

  /**
   * 关闭所有连接
   */
  public async closeAll(): Promise<void> {
    logger.info(`正在关闭所有 SSH 连接...`, {
      hostCount: this.pool.size,
    });

    const hosts = Array.from(this.pool.keys());
    for (const host of hosts) {
      await this.closeHostConnections(host);
    }

    logger.info(`所有 SSH 连接已关闭`);
  }

  /**
   * 获取连接池统计信息
   */
  public getStats(): Record<string, { total: number; inUse: number; available: number }> {
    const stats: Record<string, { total: number; inUse: number; available: number }> = {};

    for (const [host, connections] of this.pool.entries()) {
      const inUse = connections.filter((c) => c.inUse).length;
      stats[host] = {
        total: connections.length,
        inUse,
        available: connections.length - inUse,
      };
    }

    return stats;
  }

  /**
   * 获取当前连接池大小
   */
  public get size(): number {
    let total = 0;
    for (const connections of this.pool.values()) {
      total += connections.length;
    }
    return total;
  }

  /**
   * 重置单例（仅供测试使用）
   */
  public static resetInstance(): void {
    if (process.env.NODE_ENV === 'test') {
      SSHConnectionPool.instance = undefined as unknown as SSHConnectionPool;
    }
  }
}

export default SSHConnectionPool;