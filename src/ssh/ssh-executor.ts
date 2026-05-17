import type { NodeSSH } from 'node-ssh';
import type {
  ServerConfig,
  SSHExecutionResult,
  SyncDirection,
  LoggerContext,
} from '../types';
import { CommandExecutionError, FileSyncError } from '../types';
import { Logger } from '../utils/logger';
import { SecurityUtils } from '../utils/security';
import { SSHConnectionPool } from './ssh-connection';

const logger = new Logger('ssh-executor');

/**
 * 默认超时配置
 */
const DEFAULT_TIMEOUT = 30000; // 30 秒
const MAX_TIMEOUT = 300000; // 300 秒（5 分钟）

/**
 * SSH 命令执行器
 * 提供命令执行、文件同步等功能，内置安全校验和日志记录
 */
export class SSHExecutor {
  private readonly connectionPool: SSHConnectionPool;

  constructor(connectionPool?: SSHConnectionPool) {
    this.connectionPool = connectionPool || SSHConnectionPool.getInstance();
  }

  /**
   * 规范化超时时间
   */
  private normalizeTimeout(timeout?: number): number {
    if (timeout === undefined) {
      return DEFAULT_TIMEOUT;
    }
    return Math.min(Math.max(timeout, 0), MAX_TIMEOUT);
  }

  /**
   * 执行远程命令
   * @param serverConfig 服务器配置
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @param timeout 超时时间（毫秒，默认 30 秒，最大 300 秒）
   * @returns 执行结果，包含 stdout、stderr、exitCode
   * @throws CommandExecutionError 命令执行失败时抛出
   * @throws SSHConnectionError 连接失败时抛出
   * @throws SecurityError 命令不安全时抛出
   */
  public async execute(
    serverConfig: ServerConfig,
    command: string,
    workDir?: string,
    timeout?: number
  ): Promise<SSHExecutionResult> {
    const startTime = Date.now();
    const effectiveTimeout = this.normalizeTimeout(timeout);
    const host = serverConfig.host;

    // 安全校验：检查命令是否在黑名单中
    SecurityUtils.validateCommand(command);

    // 安全校验：检查工作目录（如果提供）
    if (workDir) {
      SecurityUtils.validatePath(workDir);
    }

    logger.info(`准备执行 SSH 命令`, {
      host,
      command: SecurityUtils.redact(command),
      workDir,
      timeout: effectiveTimeout,
    });

    let ssh: NodeSSH | null = null;

    try {
      // 从连接池获取连接
      ssh = await this.connectionPool.getConnection(serverConfig);

      // 执行命令
      const execOptions: {
        cwd?: string;
        timeout?: number;
      } = {
        timeout: effectiveTimeout,
      };

      if (workDir) {
        execOptions.cwd = workDir;
      }

      const result = await ssh.execCommand(command, {
        execOptions,
      });

      const duration = Date.now() - startTime;

      // 记录执行结果
      const logContext: LoggerContext = {
        host,
        command: SecurityUtils.redact(command),
        workDir,
        exitCode: result.code,
        durationMs: duration,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      };

      if (result.code === 0) {
        logger.info(`SSH 命令执行成功`, logContext);
      } else {
        logger.warn(`SSH 命令执行返回非零退出码`, logContext);
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // 区分连接错误和执行错误
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`SSH 命令执行失败`, error instanceof Error ? error : undefined, {
        host,
        command: SecurityUtils.redact(command),
        workDir,
        durationMs: duration,
      });

      throw new CommandExecutionError(
        `命令执行失败: ${errorMessage}`,
        command,
        host,
        null,
        { durationMs: duration }
      );
    } finally {
      // 释放连接回连接池
      if (ssh) {
        this.connectionPool.releaseConnection(host);
      }
    }
  }

  /**
   * 执行远程命令并校验退出码
   * @param serverConfig 服务器配置
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @param timeout 超时时间（毫秒）
   * @param expectedExitCodes 期望的退出码列表（默认 [0]）
   * @returns 执行结果
   * @throws CommandExecutionError 退出码不在期望列表时抛出
   */
  public async executeWithExitCodeCheck(
    serverConfig: ServerConfig,
    command: string,
    workDir?: string,
    timeout?: number,
    expectedExitCodes: number[] = [0]
  ): Promise<SSHExecutionResult> {
    const result = await this.execute(serverConfig, command, workDir, timeout);

    if (result.exitCode === null || !expectedExitCodes.includes(result.exitCode)) {
      throw new CommandExecutionError(
        `命令退出码 ${result.exitCode} 不在期望列表 ${expectedExitCodes.join(', ')} 中`,
        command,
        serverConfig.host,
        result.exitCode,
        {
          stdout: result.stdout.substring(0, 500),
          stderr: result.stderr.substring(0, 500),
        }
      );
    }

    return result;
  }

  /**
   * 同步文件（本地到远程 或 远程到本地）
   * @param serverConfig 服务器配置
   * @param localPath 本地路径
   * @param remotePath 远程路径
   * @param direction 同步方向
   * @returns 是否同步成功
   * @throws FileSyncError 文件同步失败时抛出
   * @throws SSHConnectionError 连接失败时抛出
   * @throws SecurityError 路径不安全时抛出
   */
  public async syncFiles(
    serverConfig: ServerConfig,
    localPath: string,
    remotePath: string,
    direction: SyncDirection
  ): Promise<boolean> {
    const startTime = Date.now();
    const host = serverConfig.host;

    // 安全校验：路径穿越检查
    SecurityUtils.validatePath(localPath);
    SecurityUtils.validatePath(remotePath);

    logger.info(`开始文件同步`, {
      host,
      localPath,
      remotePath,
      direction,
    });

    let ssh: NodeSSH | null = null;

    try {
      // 从连接池获取连接
      ssh = await this.connectionPool.getConnection(serverConfig);

      let success: boolean;

      if (direction === 'local-to-remote') {
        // 本地上传到远程
        logger.debug(`正在上传本地文件到远程`, {
          host,
          localPath,
          remotePath,
        });

        await ssh.putFile(localPath, remotePath);
        success = true;
      } else {
        // 远程下载到本地
        logger.debug(`正在下载远程文件到本地`, {
          host,
          remotePath,
          localPath,
        });

        await ssh.getFile(localPath, remotePath);
        success = true;
      }

      const duration = Date.now() - startTime;

      if (success) {
        logger.info(`文件同步成功`, {
          host,
          localPath,
          remotePath,
          direction,
          durationMs: duration,
        });
      } else {
        logger.warn(`文件同步返回失败状态`, {
          host,
          localPath,
          remotePath,
          direction,
          durationMs: duration,
        });
      }

      return success;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`文件同步失败`, error instanceof Error ? error : undefined, {
        host,
        localPath,
        remotePath,
        direction,
        durationMs: duration,
      });

      throw new FileSyncError(
        `文件同步失败: ${errorMessage}`,
        localPath,
        remotePath,
        direction,
        { durationMs: duration }
      );
    } finally {
      // 释放连接回连接池
      if (ssh) {
        this.connectionPool.releaseConnection(host);
      }
    }
  }

  /**
   * 批量执行命令
   * @param serverConfig 服务器配置
   * @param commands 命令列表
   * @param workDir 工作目录
   * @param timeout 每个命令的超时时间
   * @param stopOnError 遇到错误是否停止执行
   * @returns 每个命令的执行结果
   */
  public async executeBatch(
    serverConfig: ServerConfig,
    commands: string[],
    workDir?: string,
    timeout?: number,
    stopOnError = true
  ): Promise<Array<SSHExecutionResult & { command: string; success: boolean }>> {
    const results: Array<SSHExecutionResult & { command: string; success: boolean }> = [];

    logger.info(`开始批量执行命令`, {
      host: serverConfig.host,
      commandCount: commands.length,
      stopOnError,
    });

    for (const command of commands) {
      try {
        const result = await this.execute(serverConfig, command, workDir, timeout);
        results.push({
          ...result,
          command,
          success: result.exitCode === 0,
        });

        if (stopOnError && result.exitCode !== 0) {
          logger.warn(`批量命令执行遇到错误，停止执行`, {
            host: serverConfig.host,
            failedCommand: command,
            exitCode: result.exitCode,
          });
          break;
        }
      } catch (error) {
        results.push({
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: null,
          command,
          success: false,
        });

        if (stopOnError) {
          break;
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info(`批量命令执行完成`, {
      host: serverConfig.host,
      total: commands.length,
      success: successCount,
      failed: commands.length - successCount,
    });

    return results;
  }

  /**
   * 检查远程服务器是否可达
   * @param serverConfig 服务器配置
   * @returns 是否可达
   */
  public async isReachable(serverConfig: ServerConfig): Promise<boolean> {
    try {
      await this.executeWithExitCodeCheck(serverConfig, 'echo "ping"');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取远程文件内容
   * @param serverConfig 服务器配置
   * @param remotePath 远程文件路径
   * @returns 文件内容
   */
  public async readRemoteFile(
    serverConfig: ServerConfig,
    remotePath: string
  ): Promise<string> {
    const result = await this.executeWithExitCodeCheck(
      serverConfig,
      `cat ${remotePath}`
    );
    return result.stdout;
  }

  /**
   * 写入内容到远程文件
   * @param serverConfig 服务器配置
   * @param remotePath 远程文件路径
   * @param content 文件内容
   * @param mode 文件权限模式（可选，例如 '0644'）
   */
  public async writeRemoteFile(
    serverConfig: ServerConfig,
    remotePath: string,
    content: string,
    mode?: string
  ): Promise<void> {
    // 转义内容中的特殊字符
    const escapedContent = content
      .replace(/'/g, "'\\''")
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    const command = mode
      ? `cat > '${remotePath}' << 'EOF'\n${escapedContent}\nEOF && chmod ${mode} '${remotePath}'`
      : `cat > '${remotePath}' << 'EOF'\n${escapedContent}\nEOF`;

    await this.executeWithExitCodeCheck(serverConfig, command);
  }
}

export default SSHExecutor;