/**
 * 日志上下文类型
 */
export interface LoggerContext {
  [key: string]: unknown;
}

/**
 * 日志级别
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * 服务器配置
 */
export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

/**
 * 命令参数
 */
export interface CommandParameters {
  command: string;
  args?: string[];
  timeout?: number;
  workingDirectory?: string;
}

/**
 * 校验错误详情
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * 校验结果
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

// ==================== 数据库实体类型 ====================

/**
 * Git 远程配置
 */
export interface GitRemote {
  name: string;
  url: string;
}

/**
 * SSH 服务器配置
 */
export interface SSHServer {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: string;
}

/**
 * Agent 上下文
 */
export interface AgentContext {
  currentTask?: string;
  conversationHistory: Message[];
  workspaceState?: Record<string, unknown>;
  metadata: Record<string, string>;
}

/**
 * 消息
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * 项目实体
 */
export interface Project {
  id: string;
  name: string;
  workspace_path: string;
  git_remotes: GitRemote[];
  created_at: Date;
  updated_at: Date;
}

/**
 * 环境实体
 */
export interface Environment {
  id: string;
  project_id: string;
  name: string;
  servers: SSHServer[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Agent 实例实体
 */
export interface AgentInstance {
  id: string;
  project_id: string;
  agent_type: string;
  allowed_tools: MCPTool[];
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  context: AgentContext;
  created_at: Date;
  updated_at: Date;
}

/**
 * 部署实体
 */
export interface Deployment {
  id: string;
  project_id: string;
  env_name: string;
  branch: string;
  status: 'pending' | 'deploying' | 'success' | 'failed' | 'rolled_back';
  commit_sha: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * 表名称映射
 */
export const TABLE_NAMES = {
  PROJECTS: 'projects',
  ENVIRONMENTS: 'environments',
  AGENT_INSTANCES: 'agent_instances',
  DEPLOYMENTS: 'deployments',
} as const;

/**
 * 创建操作类型（排除自动生成字段）
 */
export type WithoutTimestampsAndId<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

/**
 * 更新操作类型（部分，排除自动生成字段）
 */
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>;

// ==================== SSH 模块类型 ====================

/**
 * SSH 命令执行结果
 */
export interface SSHExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * 文件同步方向
 */
export type SyncDirection = 'local-to-remote' | 'remote-to-local';

/**
 * SSH 连接池配置
 */
export interface SSHPoolConfig {
  maxConnections: number;
  connectionTimeout: number;
  maxRetries: number;
  retryInterval: number;
}

/**
 * 连接池中的 SSH 连接
 */
export interface PooledSSHConnection {
  instance: unknown;
  host: string;
  lastUsed: Date;
  inUse: boolean;
}

/**
 * 自定义错误类型：SSH 连接错误
 */
export class SSHConnectionError extends Error {
  public readonly host: string;
  public readonly context?: LoggerContext;

  constructor(message: string, host: string, context?: LoggerContext) {
    super(message);
    this.name = 'SSHConnectionError';
    this.host = host;
    this.context = context;
    Object.setPrototypeOf(this, SSHConnectionError.prototype);
  }
}

/**
 * 自定义错误类型：命令执行错误
 */
export class CommandExecutionError extends Error {
  public readonly command: string;
  public readonly host: string;
  public readonly exitCode?: number | null;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    command: string,
    host: string,
    exitCode?: number | null,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.host = host;
    this.exitCode = exitCode;
    this.context = context;
    Object.setPrototypeOf(this, CommandExecutionError.prototype);
  }
}

/**
 * 自定义错误类型：文件同步错误
 */
export class FileSyncError extends Error {
  public readonly localPath: string;
  public readonly remotePath: string;
  public readonly direction: SyncDirection;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    localPath: string,
    remotePath: string,
    direction: SyncDirection,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'FileSyncError';
    this.localPath = localPath;
    this.remotePath = remotePath;
    this.direction = direction;
    this.context = context;
    Object.setPrototypeOf(this, FileSyncError.prototype);
  }
}

// ==================== MCP 网关类型 ====================

/**
 * MCP 工具定义
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 工具处理函数类型
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * 注册的工具条目
 */
export interface RegisteredTool {
  definition: MCPToolDefinition;
  handler: ToolHandler;
}

// ==================== JSON-RPC 2.0 类型 ====================

/**
 * JSON-RPC 2.0 请求
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 成功响应
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

/**
 * JSON-RPC 2.0 错误对象
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 错误响应
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}

/**
 * JSON-RPC 2.0 响应类型
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * JSON-RPC 2.0 批量请求
 */
export type JsonRpcBatchRequest = JsonRpcRequest[];

/**
 * JSON-RPC 2.0 批量响应
 */
export type JsonRpcBatchResponse = JsonRpcResponse[];

// ==================== MCP 协议错误码 ====================

/**
 * JSON-RPC 2.0 标准错误码
 */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * MCP 工具错误码
 */
export const MCP_TOOL_ERROR_CODES = {
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_FAILED: -32002,
  TOOL_VALIDATION_FAILED: -32003,
} as const;
