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
 * 部署状态枚举
 */
export type DeploymentStatus = 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';

/**
 * 环境实体
 */
export interface Environment {
  id: string;
  project_id: string;
  name: string;
  servers: SSHServer[];
  config?: EnvironmentConfig;
  created_at: Date;
  updated_at: Date;
}

/**
 * 环境配置
 */
export interface EnvironmentConfig {
  buildCommand?: string;
  deployScript?: string;
  remotePath?: string;
  healthCheckEndpoint?: string;
  healthCheckTimeout?: number;
  variables?: Record<string, string>;
}

/**
 * Agent 状态枚举
 */
export type AgentStatus = 'inactive' | 'active' | 'paused' | 'error';

/**
 * Agent 上下文数据
 */
export interface Context {
  [key: string]: unknown;
  conversationHistory: Message[];
  currentTask?: string;
  workspaceState?: Record<string, unknown>;
  metadata: Record<string, string>;
}

/**
 * Agent 消息
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Agent 审计日志条目
 */
export interface AgentAuditLog {
  id: string;
  agent_id: string;
  action: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Agent 配置选项
 */
export interface AgentConfig {
  maxHistoryLength?: number;
  timeout?: number;
  allowedTools?: string[];
  metadata?: Record<string, string>;
}

/**
 * Agent 创建结果
 */
export interface AgentCreateResult {
  agent_id: string;
  token: string;
  status: AgentStatus;
}

/**
 * Agent 实例实体
 */
export interface AgentInstance {
  id: string;
  project_id: string;
  agent_type: string;
  token: string;
  allowed_tools: string[];
  status: AgentStatus;
  context: Context;
  history: Message[];
  audit_logs: AgentAuditLog[];
  config: AgentConfig;
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
  status: DeploymentStatus;
  commit_sha: string;
  output?: string;
  error?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * 部署结果
 */
export interface DeploymentResult {
  deploymentId: string;
  status: DeploymentStatus;
  healthCheckResult: HealthCheckResult;
  output?: string;
  error?: string;
}

/**
 * 部署选项
 */
export interface DeployOptions {
  buildCommand?: string;
  deployScript?: string;
  skipBuild?: boolean;
  skipHealthCheck?: boolean;
  timeout?: number;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  healthy: boolean;
  serverResults: ServerHealthCheck[];
  totalServers: number;
  healthyServers: number;
  message?: string;
}

/**
 * 服务器健康检查结果
 */
export interface ServerHealthCheck {
  host: string;
  reachable: boolean;
  serviceRunning?: boolean;
  error?: string;
  responseTime?: number;
}

/**
 * 日志查询选项
 */
export interface LogQueryOptions {
  service?: string;
  lines?: number;
  filter?: string;
  since?: Date;
  until?: Date;
}

/**
 * 表名称映射
 */
export const TABLE_NAMES = {
  PROJECTS: 'projects',
  ENVIRONMENTS: 'environments',
  AGENT_INSTANCES: 'agent_instances',
  DEPLOYMENTS: 'deployments',
  WORKFLOWS: 'workflows',
  WORKFLOW_RUNS: 'workflow_runs',
} as const;

// ==================== 工作流编排类型 ====================

/**
 * 工作流状态枚举
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 步骤类型枚举
 */
export type StepType = 'shell' | 'git' | 'deploy' | 'tool' | 'condition' | 'parallel' | 'loop' | 'wait';

/**
 * Git 操作子类型
 */
export type GitOperationType = 'clone' | 'commit' | 'push' | 'pull' | 'branch' | 'checkout' | 'merge' | 'status' | 'log';

/**
 * 步骤重试配置
 */
export interface StepRetryConfig {
  maxAttempts: number;
  delayMs?: number;
  backoffMultiplier?: number;
}

/**
 * 工作流步骤定义
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description?: string;
  timeout?: number;
  retry?: StepRetryConfig;
  continueOnError?: boolean;
  condition?: string;
  dependsOn?: string[];

  // shell 步骤配置
  command?: string;
  args?: string[];
  workingDirectory?: string;
  remoteServer?: string;

  // git 步骤配置
  gitOperation?: GitOperationType;
  repoUrl?: string;
  targetPath?: string;
  branchName?: string;
  commitMessage?: string;
  remoteName?: string;

  // deploy 步骤配置
  environmentName?: string;
  buildCommand?: string;
  skipBuild?: boolean;

  // tool 步骤配置
  toolName?: string;
  toolParams?: Record<string, unknown>;

  // condition 步骤配置
  if?: string;
  then?: WorkflowStep[];
  else?: WorkflowStep[];

  // parallel 步骤配置
  parallel?: WorkflowStep[];
  maxConcurrency?: number;

  // loop 步骤配置
  loopType?: 'for' | 'while';
  iterations?: number;
  iteratorVar?: string;
  items?: unknown[];
  whileCondition?: string;
  do?: WorkflowStep[];

  // wait 步骤配置
  waitMs?: number;
  waitUntil?: string;

  // 输出变量配置
  outputVar?: string;
}

/**
 * 步骤执行结果
 */
export interface StepExecutionResult {
  stepId: string;
  stepName: string;
  status: WorkflowStatus;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  attempt: number;
  output?: unknown;
  error?: string;
  errorStack?: string;
  contextSnapshot?: Record<string, unknown>;
}

/**
 * 工作流定义
 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  isBuiltIn: boolean;
  isEnabled: boolean;
  parameters?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object';
    required?: boolean;
    default?: unknown;
    description?: string;
  }>;
  steps: WorkflowStep[];
  tags?: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * 工作流执行记录
 */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  projectId?: string;
  status: WorkflowStatus;
  parameters?: Record<string, unknown>;
  context: Record<string, unknown>;
  steps: StepExecutionResult[];
  result?: unknown;
  error?: string;
  errorStack?: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  cancelledAt?: Date;
  cancelledBy?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * 工作流创建参数
 */
export type WorkflowCreateInput = {
  name: string;
  description?: string;
  version?: string;
  isEnabled?: boolean;
  parameters?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object';
    required?: boolean;
    default?: unknown;
    description?: string;
  }>;
  steps: WorkflowStep[];
  tags?: string[];
};

/**
 * 工作流执行选项
 */
export interface WorkflowRunOptions {
  projectId?: string;
  parameters?: Record<string, unknown>;
  timeout?: number;
  dryRun?: boolean;
}

/**
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext {
  runId: string;
  workflowId: string;
  projectId?: string;
  parameters: Record<string, unknown>;
  variables: Record<string, unknown>;
  startTime: Date;
  isCancelled: boolean;
  stepResults: Map<string, StepExecutionResult>;
}

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

// ==================== Git 管理类型 ====================

/**
 * Git 分支信息
 */
export interface GitBranch {
  name: string;
  current: boolean;
  commit?: string;
  label?: string;
}

/**
 * Git 分支列表
 */
export interface GitBranchSummary {
  all: string[];
  branches: GitBranch[];
  current?: string;
  detached: boolean;
}

/**
 * Git 状态信息
 */
export interface GitStatus {
  isRepo: boolean;
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
  conflicted: string[];
  renamed: string[];
  currentBranch?: string;
  latestCommit?: string;
  tracking?: string;
  ahead: number;
  behind: number;
  notAdded: string[];
}

/**
 * Git 提交记录
 */
export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  timestamp?: number;
  body?: string;
}

/**
 * Git 提交历史
 */
export interface GitCommitHistory {
  total: number;
  commits: GitCommit[];
}

/**
 * Git 远程仓库信息
 */
export interface GitRemoteInfo {
  name: string;
  url: string;
  refs?: {
    fetch?: string;
    push?: string;
  };
}

/**
 * Git 提交选项
 */
export interface GitCommitOptions {
  author?: string;
  sign?: boolean;
  noVerify?: boolean;
  amend?: boolean;
}

/**
 * Git 推送选项
 */
export interface GitPushOptions {
  force?: boolean;
  setUpstream?: boolean;
  forceWithLease?: boolean;
  tags?: boolean;
}

/**
 * Git 克隆选项
 */
export interface GitCloneOptions {
  depth?: number;
  branch?: string;
  singleBranch?: boolean;
  bare?: boolean;
  mirror?: boolean;
}

/**
 * PR 创建选项
 */
export interface PullRequestCreateOptions {
  title: string;
  body?: string;
  base: string;
  head: string;
  labels?: string[];
  reviewers?: string[];
}

/**
 * Pull Request 信息
 */
export interface PullRequestInfo {
  id: string;
  url: string;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  headBranch: string;
  baseBranch: string;
}

/**
 * 自定义错误类型：Git 操作错误
 */
export class GitOperationError extends Error {
  public readonly operation: string;
  public readonly workspacePath: string;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    operation: string,
    workspacePath: string,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'GitOperationError';
    this.operation = operation;
    this.workspacePath = workspacePath;
    this.context = context;
    Object.setPrototypeOf(this, GitOperationError.prototype);
  }
}

/**
 * 自定义错误类型：环境管理错误
 */
export class EnvironmentError extends Error {
  public readonly projectId?: string;
  public readonly envName?: string;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    projectId?: string,
    envName?: string,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'EnvironmentError';
    this.projectId = projectId;
    this.envName = envName;
    this.context = context;
    Object.setPrototypeOf(this, EnvironmentError.prototype);
  }
}

/**
 * 自定义错误类型：部署错误
 */
export class DeploymentError extends Error {
  public readonly deploymentId?: string;
  public readonly projectId?: string;
  public readonly envName?: string;
  public readonly context?: LoggerContext;

  constructor(
    message: string,
    projectId?: string,
    envName?: string,
    deploymentId?: string,
    context?: LoggerContext
  ) {
    super(message);
    this.name = 'DeploymentError';
    this.projectId = projectId;
    this.envName = envName;
    this.deploymentId = deploymentId;
    this.context = context;
    Object.setPrototypeOf(this, DeploymentError.prototype);
  }
}

/**
 * 自定义错误类型：Git 仓库未初始化错误
 */
export class GitRepoNotFoundError extends Error {
  public readonly workspacePath: string;
  public readonly context?: LoggerContext;

  constructor(workspacePath: string, context?: LoggerContext) {
    super(`Git 仓库不存在: ${workspacePath}`);
    this.name = 'GitRepoNotFoundError';
    this.workspacePath = workspacePath;
    this.context = context;
    Object.setPrototypeOf(this, GitRepoNotFoundError.prototype);
  }
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
