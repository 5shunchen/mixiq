import process from 'process';
import readline from 'readline';
import { db, MixIQDatabase } from './db/database';
import { SSHConnectionPool } from './ssh/ssh-connection';
import { SSHExecutor } from './ssh/ssh-executor';
import { ProjectManager } from './managers/project-manager';
import { GitManager } from './managers/git-manager';
import { EnvManager } from './managers/env-manager';
import { AgentManager } from './managers/agent-manager';
import { Orchestrator } from './managers/orchestrator';
import { ToolRegistry } from './gateway/tool-registry';
import { MCPGateway } from './gateway/mcp-gateway';
import { registerProjectTools } from './tools/project-tools';
import { registerExecuteTools } from './tools/execute-tools';
import { registerGitTools } from './tools/git-tools';
import { registerEnvTools } from './tools/env-tools';
import { registerAgentTools } from './tools/agent-tools';
import { registerOrchestratorTools } from './tools/orchestrator-tools';
import { Logger } from './utils/logger';
import { JsonRpcResponse, JsonRpcBatchResponse } from './types';

/**
 * MCP 服务器版本
 */
export const VERSION = '1.0.0';

/**
 * MCP 服务器主类
 */
export class MCPServer {
  private readonly logger: Logger;
  private readonly db: MixIQDatabase;
  private readonly sshPool: SSHConnectionPool;
  private readonly sshExecutor: SSHExecutor;
  private readonly projectManager: ProjectManager;
  private readonly gitManager: GitManager;
  private readonly envManager: EnvManager;
  private readonly agentManager: AgentManager;
  private readonly orchestrator: Orchestrator;
  private readonly toolRegistry: ToolRegistry;
  private readonly gateway: MCPGateway;
  private isShuttingDown = false;
  private rl: readline.Interface | null = null;

  constructor() {
    this.logger = new Logger('server');
    this.db = db;
    this.sshPool = SSHConnectionPool.getInstance();
    this.sshExecutor = new SSHExecutor(this.sshPool);
    this.projectManager = new ProjectManager(this.db);
    this.gitManager = new GitManager();
    this.envManager = new EnvManager(this.db, this.sshExecutor, this.gitManager);
    this.agentManager = new AgentManager(this.db);
    this.orchestrator = new Orchestrator();
    this.toolRegistry = new ToolRegistry();
    this.gateway = new MCPGateway(this.toolRegistry);
  }

  /**
   * 初始化服务器
   */
  public async initialize(): Promise<void> {
    this.logger.info('正在初始化 MixIQ MCP 服务器', { version: VERSION });

    try {
      // 1. 初始化数据库
      this.db.init();
      this.logger.info('数据库初始化完成');

      // 2. 注册所有 MCP 工具
      await this.registerAllTools();
      this.logger.info('工具注册完成', { count: this.toolRegistry.size() });

      // 3. 设置信号处理
      this.setupSignalHandlers();

      this.logger.info('MixIQ MCP 服务器初始化成功');
    } catch (error) {
      const err = error as Error;
      this.logger.error('服务器初始化失败', err);
      throw err;
    }
  }

  /**
   * 注册所有 MCP 工具
   */
  private async registerAllTools(): Promise<void> {
    // 注册项目管理工具
    registerProjectTools(this.toolRegistry, this.projectManager);

    // 注册命令执行工具
    registerExecuteTools(this.toolRegistry, this.sshExecutor);

    // 注册 Git 管理工具
    registerGitTools(this.toolRegistry, this.gitManager);

    // 注册环境管理工具
    registerEnvTools(this.toolRegistry, this.envManager, this.projectManager);

    // 注册智能体管理工具
    registerAgentTools(this.toolRegistry, this.agentManager, this.projectManager);

    // 注册任务编排工具
    registerOrchestratorTools(this.toolRegistry, this.orchestrator);
  }

  /**
   * 启动 stdio 服务器（MCP 标准模式）
   */
  public startStdioServer(): void {
    this.logger.info('启动 stdio MCP 服务器');

    // 创建 readline 接口用于读取 stdin 行
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // 处理每行输入
    this.rl.on('line', async (line: string) => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.handleIncomingLine(line);
      } catch (error) {
        const err = error as Error;
        this.logger.error('处理请求行失败', err);
      }
    });

    // 处理输入关闭
    this.rl.on('close', () => {
      this.logger.info('stdin 已关闭');
      if (!this.isShuttingDown) {
        void this.shutdown();
      }
    });

    // 处理 stdin 错误
    process.stdin.on('error', (error: Error) => {
      this.logger.error('stdin 错误', error);
    });

    // 处理 stdout 错误
    process.stdout.on('error', (error: Error) => {
      this.logger.error('stdout 错误', error);
    });

    this.logger.info('MCP 服务器已就绪，等待请求...');
  }

  /**
   * 处理传入的请求行
   */
  private async handleIncomingLine(line: string): Promise<void> {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    this.logger.debug('收到请求', { line: trimmedLine });

    try {
      // 解析 JSON
      const request = JSON.parse(trimmedLine);

      // 通过网关处理请求
      const response = await this.gateway.handleRequest(request);

      // 如果有响应（非通知），发送回去
      if (response) {
        this.sendResponse(response);
      }
    } catch (error) {
      const err = error as Error;
      this.logger.warn('解析请求失败', { error: err.message, line: trimmedLine });

      // 返回解析错误
      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: null,
        error: {
          code: -32700,
          message: '解析错误: 无效的 JSON',
          data: err.message,
        },
      };
      this.sendResponse(errorResponse);
    }
  }

  /**
   * 发送响应到 stdout
   */
  private sendResponse(response: JsonRpcResponse | JsonRpcBatchResponse): void {
    try {
      const responseJson = JSON.stringify(response);
      process.stdout.write(responseJson + '\n');
      this.logger.debug('已发送响应');
    } catch (error) {
      const err = error as Error;
      this.logger.error('序列化响应失败', err);
    }
  }

  /**
   * 设置信号处理程序
   */
  private setupSignalHandlers(): void {
    // SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.info('收到 SIGINT 信号，开始优雅关闭');
      void this.shutdown();
    });

    // SIGTERM
    process.on('SIGTERM', () => {
      this.logger.info('收到 SIGTERM 信号，开始优雅关闭');
      void this.shutdown();
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      this.logger.error('未捕获的异常', error);
      void this.shutdown(1);
    });

    // 未处理的 Promise rejection
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('未处理的 Promise rejection', undefined, {
        reason: reason ? String(reason) : 'unknown',
        promise: String(promise),
      });
    });
  }

  /**
   * 优雅关闭服务器
   * @param exitCode 退出码
   */
  public async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('开始优雅关闭服务器');

    try {
      // 关闭 readline 接口
      if (this.rl) {
        this.rl.close();
        this.rl = null;
      }

      // 关闭 SSH 连接池
      try {
        await this.sshPool.closeAll();
        this.logger.info('SSH 连接池已关闭');
      } catch (error) {
        const err = error as Error;
        this.logger.warn('关闭 SSH 连接池时出错', { errorMessage: err.message });
      }

      // 关闭数据库
      try {
        this.db.close();
      } catch (error) {
        const err = error as Error;
        this.logger.warn('关闭数据库时出错', { errorMessage: err.message });
      }

      this.logger.info('服务器关闭完成');
      process.exit(exitCode);
    } catch (error) {
      const err = error as Error;
      this.logger.error('关闭服务器时出错', err);
      process.exit(1);
    }
  }

  /**
   * 获取工具注册表
   */
  public getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取网关
   */
  public getGateway(): MCPGateway {
    return this.gateway;
  }

  /**
   * 获取项目管理器
   */
  public getProjectManager(): ProjectManager {
    return this.projectManager;
  }

  /**
   * 获取 SSH 执行器
   */
  public getSSHExecutor(): SSHExecutor {
    return this.sshExecutor;
  }
}

/**
 * 服务器单例实例
 */
export const server = new MCPServer();

/**
 * 如果直接运行此文件，启动服务器
 */
if (require.main === module) {
  (async () => {
    try {
      await server.initialize();
      server.startStdioServer();
    } catch (error) {
      const err = error as Error;
      console.error('服务器启动失败:', err.message);
      process.exit(1);
    }
  })();
}

export default MCPServer;
