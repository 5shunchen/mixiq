import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  AgentInstance,
  AgentStatus,
  Context,
  Message,
  AgentAuditLog,
  AgentConfig,
  AgentCreateResult,
  TABLE_NAMES,
} from '../types';
import { Logger } from '../utils/logger';
import { validateUUID, z } from '../utils/validator';
import { SecurityUtils } from '../utils/security';
import { MixIQDatabase, db, RecordNotFoundError } from '../db/database';

/**
 * 自定义错误类型：Agent 管理错误
 */
export class AgentManagerError extends Error {
  public readonly agentId?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    agentId?: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentManagerError';
    this.agentId = agentId;
    this.context = context;
    Object.setPrototypeOf(this, AgentManagerError.prototype);
  }
}

/**
 * Agent 创建参数校验 Schema
 */
const CreateAgentSchema = z.object({
  projectId: z.string().uuid('项目 ID 格式不正确'),
  agentType: z.string().min(1, 'Agent 类型不能为空').max(100, 'Agent 类型长度不能超过 100'),
  allowedTools: z.array(z.string()).optional(),
  config: z
    .object({
      maxHistoryLength: z.number().int().min(1).max(10000).optional(),
      timeout: z.number().int().min(1000).max(3600000).optional(),
      allowedTools: z.array(z.string()).optional(),
      metadata: z.record(z.string()).optional(),
    })
    .optional(),
});

/**
 * Agent 更新参数校验 Schema
 */
const UpdateAgentSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  status: z.enum(['inactive', 'active', 'paused', 'error']).optional(),
  config: z
    .object({
      maxHistoryLength: z.number().int().min(1).max(10000).optional(),
      timeout: z.number().int().min(1000).max(3600000).optional(),
      allowedTools: z.array(z.string()).optional(),
      metadata: z.record(z.string()).optional(),
    })
    .optional(),
});

/**
 * 智能体管理器
 * 负责 Agent 的生命周期管理、上下文维护、工具绑定和审计日志
 */
export class AgentManager {
  private readonly logger: Logger;
  private readonly db: MixIQDatabase;
  private currentAgentId: string | null = null;
  private readonly DEFAULT_MAX_HISTORY = 1000;

  constructor(database: MixIQDatabase = db) {
    this.logger = new Logger('agent-manager');
    this.db = database;
    this.ensureDbInitialized();
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDbInitialized(): void {
    try {
      // 尝试执行简单查询来检查是否已初始化
      this.db.query('SELECT 1');
    } catch {
      this.db.init();
    }
  }

  /**
   * 生成安全的 Agent Token
   */
  private generateAgentToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 生成 UUID v4
   */
  private generateId(): string {
    return uuidv4();
  }

  /**
   * 获取当前时间 ISO 字符串
   */
  private getCurrentTime(): string {
    return new Date().toISOString();
  }

  /**
   * 序列化 JSON 字段用于数据库存储
   */
  private serializeJsonFields(data: Record<string, unknown>): Record<string, unknown> {
    const result = { ...data };
    const jsonFields = ['allowed_tools', 'context', 'history', 'audit_logs', 'config'];

    for (const field of jsonFields) {
      if (field in result && result[field] !== undefined && typeof result[field] !== 'string') {
        result[field] = JSON.stringify(result[field]);
      }
    }

    return result;
  }

  /**
   * 反序列化数据库行中的 JSON 字段
   */
  private deserializeAgentRow(row: Record<string, unknown>): AgentInstance {
    const result: Record<string, unknown> = { ...row };
    const jsonFields = ['allowed_tools', 'context', 'history', 'audit_logs', 'config'];

    for (const field of jsonFields) {
      if (field in result && typeof result[field] === 'string') {
        try {
          result[field] = JSON.parse(result[field] as string);
        } catch {
          // 解析失败时使用默认值
          if (field === 'allowed_tools') result[field] = [];
          else if (field === 'context') result[field] = { conversationHistory: [], metadata: {} };
          else if (field === 'history') result[field] = [];
          else if (field === 'audit_logs') result[field] = [];
          else if (field === 'config') result[field] = {};
        }
      }
    }

    // 将时间字符串转换为 Date 对象
    if ('created_at' in result && typeof result.created_at === 'string') {
      result.created_at = new Date(result.created_at);
    }
    if ('updated_at' in result && typeof result.updated_at === 'string') {
      result.updated_at = new Date(result.updated_at);
    }

    return result as unknown as AgentInstance;
  }

  // ============================================================================
  // 核心方法：Agent 生命周期管理
  // ============================================================================

  /**
   * 创建新的智能体实例
   * @param projectId 项目 ID
   * @param agentType Agent 类型
   * @param allowedTools 允许使用的工具列表
   * @param config Agent 配置
   * @returns 创建结果（agent_id, token, status）
   */
  public createAgent(
    projectId: string,
    agentType: string,
    allowedTools: string[] = [],
    config: AgentConfig = {}
  ): AgentCreateResult {
    try {
      this.logger.info('开始创建 Agent', { projectId, agentType });

      // 参数校验
      const validated = CreateAgentSchema.parse({ projectId, agentType, allowedTools, config });

      // 初始化空上下文
      const initialContext: Context = {
        conversationHistory: [],
        metadata: config.metadata || {},
      };

      const agentId = this.generateId();
      const token = this.generateAgentToken();
      const now = this.getCurrentTime();

      const agentData = {
        id: agentId,
        project_id: validated.projectId,
        agent_type: validated.agentType,
        token,
        allowed_tools: validated.allowedTools || [],
        status: 'inactive' as AgentStatus,
        context: initialContext,
        history: [],
        audit_logs: [],
        config: {
          maxHistoryLength: config.maxHistoryLength || this.DEFAULT_MAX_HISTORY,
          timeout: config.timeout,
          metadata: config.metadata,
        },
        created_at: now,
        updated_at: now,
      };

      // 插入数据库
      const serialized = this.serializeJsonFields(agentData);
      const keys = Object.keys(serialized);
      const placeholders = keys.map(() => '?').join(', ');
      const values = Object.values(serialized);

      const sql = `INSERT INTO ${TABLE_NAMES.AGENT_INSTANCES} (${keys.join(', ')}) VALUES (${placeholders})`;
      this.db.execute(sql, values);

      // 记录审计日志
      this.logAction(agentId, 'agent_created', {
        projectId: validated.projectId,
        agentType: validated.agentType,
      });

      this.logger.info('Agent 创建成功', { agentId, projectId, agentType });

      return {
        agent_id: agentId,
        token,
        status: 'inactive',
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error('创建 Agent 失败', err, { projectId, agentType });
      throw new AgentManagerError(`创建 Agent 失败: ${err.message}`, undefined, { projectId, agentType });
    }
  }

  /**
   * 获取单个智能体信息
   * @param agentId Agent ID
   * @returns Agent 实例
   */
  public getAgent(agentId: string): AgentInstance {
    try {
      validateUUID(agentId);

      const sql = `SELECT * FROM ${TABLE_NAMES.AGENT_INSTANCES} WHERE id = ? LIMIT 1`;
      const rows = this.db.query<Record<string, unknown>>(sql, [agentId]);

      if (rows.length === 0) {
        throw new RecordNotFoundError(`Agent 不存在: ${agentId}`, TABLE_NAMES.AGENT_INSTANCES, agentId);
      }

      return this.deserializeAgentRow(rows[0]);
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        throw error;
      }
      const err = error as Error;
      this.logger.error('获取 Agent 信息失败', err, { agentId });
      throw new AgentManagerError(`获取 Agent 信息失败: ${err.message}`, agentId);
    }
  }

  /**
   * 列出项目的所有智能体
   * @param projectId 项目 ID
   * @returns Agent 列表
   */
  public listAgents(projectId: string): AgentInstance[] {
    try {
      validateUUID(projectId);

      const sql = `SELECT * FROM ${TABLE_NAMES.AGENT_INSTANCES} WHERE project_id = ? ORDER BY created_at DESC`;
      const rows = this.db.query<Record<string, unknown>>(sql, [projectId]);

      return rows.map((row) => this.deserializeAgentRow(row));
    } catch (error) {
      const err = error as Error;
      this.logger.error('列出 Agent 失败', err, { projectId });
      throw new AgentManagerError(`列出 Agent 失败: ${err.message}`, undefined, { projectId });
    }
  }

  /**
   * 更新智能体配置
   * @param agentId Agent ID
   * @param updates 更新内容
   * @returns 更新后的 Agent 实例
   */
  public updateAgent(
    agentId: string,
    updates: {
      allowedTools?: string[];
      status?: AgentStatus;
      config?: AgentConfig;
    }
  ): AgentInstance {
    try {
      validateUUID(agentId);

      // 检查 Agent 是否存在
      const existing = this.getAgent(agentId);

      // 参数校验
      const validated = UpdateAgentSchema.parse(updates);

      const updateData: Record<string, unknown> = {
        updated_at: this.getCurrentTime(),
      };

      if (validated.allowedTools !== undefined) {
        updateData.allowed_tools = validated.allowedTools;
      }

      if (validated.status !== undefined) {
        updateData.status = validated.status;
      }

      if (validated.config !== undefined) {
        updateData.config = {
          ...existing.config,
          ...validated.config,
        };
      }

      this.db.update(TABLE_NAMES.AGENT_INSTANCES, agentId, updateData);

      // 记录审计日志
      this.logAction(agentId, 'agent_updated', { updates: Object.keys(updates) });

      this.logger.info('Agent 更新成功', { agentId });

      return this.getAgent(agentId);
    } catch (error) {
      const err = error as Error;
      this.logger.error('更新 Agent 失败', err, { agentId });
      throw new AgentManagerError(`更新 Agent 失败: ${err.message}`, agentId);
    }
  }

  /**
   * 删除智能体实例
   * @param agentId Agent ID
   * @returns 是否删除成功
   */
  public deleteAgent(agentId: string): boolean {
    try {
      validateUUID(agentId);

      // 检查 Agent 是否存在
      this.getAgent(agentId);

      const sql = `DELETE FROM ${TABLE_NAMES.AGENT_INSTANCES} WHERE id = ?`;
      this.db.execute(sql, [agentId]);

      // 如果删除的是当前活动 Agent，清除当前活动状态
      if (this.currentAgentId === agentId) {
        this.currentAgentId = null;
      }

      this.logger.info('Agent 删除成功', { agentId });

      return true;
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        return false;
      }
      const err = error as Error;
      this.logger.error('删除 Agent 失败', err, { agentId });
      throw new AgentManagerError(`删除 Agent 失败: ${err.message}`, agentId);
    }
  }

  /**
   * 切换当前活动智能体
   * @param agentId Agent ID
   */
  public switchAgent(agentId: string): void {
    try {
      validateUUID(agentId);

      // 检查 Agent 是否存在
      this.getAgent(agentId);

      this.currentAgentId = agentId;

      // 记录审计日志
      this.logAction(agentId, 'agent_switched');

      this.logger.info('已切换到 Agent', { agentId });
    } catch (error) {
      const err = error as Error;
      this.logger.error('切换 Agent 失败', err, { agentId });
      throw new AgentManagerError(`切换 Agent 失败: ${err.message}`, agentId);
    }
  }

  /**
   * 获取当前活动智能体
   * @returns 当前活动 Agent 实例或 null
   */
  public getCurrentAgent(): AgentInstance | null {
    if (!this.currentAgentId) {
      return null;
    }

    try {
      return this.getAgent(this.currentAgentId);
    } catch {
      this.currentAgentId = null;
      return null;
    }
  }

  // ============================================================================
  // 上下文管理
  // ============================================================================

  /**
   * 设置上下文键值对
   * @param agentId Agent ID
   * @param key 键名
   * @param value 值
   */
  public setContext(agentId: string, key: string, value: unknown): void {
    try {
      validateUUID(agentId);

      if (!key || typeof key !== 'string') {
        throw new AgentManagerError('上下文键名必须是非空字符串', agentId);
      }

      const agent = this.getAgent(agentId);
      const newContext = {
        ...agent.context,
        [key]: SecurityUtils.redactObject(value),
      };

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET context = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(newContext), this.getCurrentTime(), agentId]);

      // 记录审计日志
      this.logAction(agentId, 'context_updated', { key });

      this.logger.debug('上下文已更新', { agentId, key });
    } catch (error) {
      const err = error as Error;
      this.logger.error('设置上下文失败', err, { agentId, key });
      throw new AgentManagerError(`设置上下文失败: ${err.message}`, agentId, { key });
    }
  }

  /**
   * 获取上下文
   * @param agentId Agent ID
   * @param key 可选键名，不传则返回全部上下文
   * @returns 上下文值或全部上下文
   */
  public getContext(agentId: string): Context;
  public getContext(agentId: string, key: string): unknown;
  public getContext(agentId: string, key?: string): unknown {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);

      if (key === undefined) {
        return agent.context;
      }

      return agent.context[key];
    } catch (error) {
      const err = error as Error;
      this.logger.error('获取上下文失败', err, { agentId, key });
      throw new AgentManagerError(`获取上下文失败: ${err.message}`, agentId, { key });
    }
  }

  /**
   * 清空上下文
   * @param agentId Agent ID
   */
  public clearContext(agentId: string): void {
    try {
      validateUUID(agentId);

      const emptyContext: Context = {
        conversationHistory: [],
        metadata: {},
      };

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET context = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(emptyContext), this.getCurrentTime(), agentId]);

      // 记录审计日志
      this.logAction(agentId, 'context_cleared');

      this.logger.info('上下文已清空', { agentId });
    } catch (error) {
      const err = error as Error;
      this.logger.error('清空上下文失败', err, { agentId });
      throw new AgentManagerError(`清空上下文失败: ${err.message}`, agentId);
    }
  }

  /**
   * 添加消息到对话历史
   * @param agentId Agent ID
   * @param message 消息内容
   */
  public appendToHistory(agentId: string, message: Omit<Message, 'id' | 'timestamp'>): void {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);
      const maxHistory = agent.config.maxHistoryLength || this.DEFAULT_MAX_HISTORY;

      const newMessage: Message = {
        id: this.generateId(),
        timestamp: new Date(),
        ...message,
      };

      // 限制历史记录长度
      const newHistory = [...agent.history, newMessage].slice(-maxHistory);

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET history = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(newHistory), this.getCurrentTime(), agentId]);

      this.logger.debug('消息已添加到历史记录', { agentId, role: message.role });
    } catch (error) {
      const err = error as Error;
      this.logger.error('添加历史消息失败', err, { agentId });
      throw new AgentManagerError(`添加历史消息失败: ${err.message}`, agentId);
    }
  }

  /**
   * 获取对话历史
   * @param agentId Agent ID
   * @param limit 可选限制条数
   * @returns 消息历史列表
   */
  public getHistory(agentId: string, limit?: number): Message[] {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);
      let history = agent.history;

      if (limit !== undefined && limit > 0) {
        history = history.slice(-limit);
      }

      return history;
    } catch (error) {
      const err = error as Error;
      this.logger.error('获取历史记录失败', err, { agentId });
      throw new AgentManagerError(`获取历史记录失败: ${err.message}`, agentId);
    }
  }

  // ============================================================================
  // 工具管理
  // ============================================================================

  /**
   * 获取智能体可用的工具列表
   * @param agentId Agent ID
   * @returns 可用工具名称列表
   */
  public getAvailableTools(agentId: string): string[] {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);
      return agent.allowed_tools;
    } catch (error) {
      const err = error as Error;
      this.logger.error('获取可用工具失败', err, { agentId });
      throw new AgentManagerError(`获取可用工具失败: ${err.message}`, agentId);
    }
  }

  /**
   * 绑定工具到智能体
   * @param agentId Agent ID
   * @param toolName 工具名称
   */
  public bindTool(agentId: string, toolName: string): void {
    try {
      validateUUID(agentId);

      if (!toolName || typeof toolName !== 'string') {
        throw new AgentManagerError('工具名称必须是非空字符串', agentId);
      }

      const agent = this.getAgent(agentId);

      if (agent.allowed_tools.includes(toolName)) {
        this.logger.warn('工具已绑定，跳过', { agentId, toolName });
        return;
      }

      const newAllowedTools = [...agent.allowed_tools, toolName];

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET allowed_tools = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(newAllowedTools), this.getCurrentTime(), agentId]);

      // 记录审计日志
      this.logAction(agentId, 'tool_bound', { toolName });

      this.logger.info('工具已绑定', { agentId, toolName });
    } catch (error) {
      const err = error as Error;
      this.logger.error('绑定工具失败', err, { agentId, toolName });
      throw new AgentManagerError(`绑定工具失败: ${err.message}`, agentId, { toolName });
    }
  }

  /**
   * 解绑智能体的工具
   * @param agentId Agent ID
   * @param toolName 工具名称
   */
  public unbindTool(agentId: string, toolName: string): void {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);

      if (!agent.allowed_tools.includes(toolName)) {
        this.logger.warn('工具未绑定，跳过', { agentId, toolName });
        return;
      }

      const newAllowedTools = agent.allowed_tools.filter((t) => t !== toolName);

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET allowed_tools = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(newAllowedTools), this.getCurrentTime(), agentId]);

      // 记录审计日志
      this.logAction(agentId, 'tool_unbound', { toolName });

      this.logger.info('工具已解绑', { agentId, toolName });
    } catch (error) {
      const err = error as Error;
      this.logger.error('解绑工具失败', err, { agentId, toolName });
      throw new AgentManagerError(`解绑工具失败: ${err.message}`, agentId, { toolName });
    }
  }

  // ============================================================================
  // 审计和状态
  // ============================================================================

  /**
   * 记录智能体操作审计日志
   * @param agentId Agent ID
   * @param action 操作类型
   * @param details 操作详情
   */
  public logAction(agentId: string, action: string, details?: Record<string, unknown>): void {
    try {
      const agent = this.getAgent(agentId);

      const auditLog: AgentAuditLog = {
        id: this.generateId(),
        agent_id: agentId,
        action,
        details: details ? SecurityUtils.redactObject(details) : undefined,
        timestamp: new Date(),
      };

      const newAuditLogs = [...agent.audit_logs, auditLog].slice(-1000); // 保留最近 1000 条

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET audit_logs = ? WHERE id = ?`;
      this.db.execute(sql, [JSON.stringify(newAuditLogs), agentId]);
    } catch (error) {
      // 日志记录失败不影响主流程，只记录错误
      const err = error as Error;
      this.logger.warn('记录审计日志失败', { agentId, action, error: err.message });
    }
  }

  /**
   * 获取审计日志
   * @param agentId Agent ID
   * @param limit 可选限制条数
   * @returns 审计日志列表
   */
  public getAuditLog(agentId: string, limit?: number): AgentAuditLog[] {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);
      let logs = agent.audit_logs;

      if (limit !== undefined && limit > 0) {
        logs = logs.slice(-limit);
      }

      return logs;
    } catch (error) {
      const err = error as Error;
      this.logger.error('获取审计日志失败', err, { agentId });
      throw new AgentManagerError(`获取审计日志失败: ${err.message}`, agentId);
    }
  }

  /**
   * 获取智能体运行状态
   * @param agentId Agent ID
   * @returns Agent 状态
   */
  public getAgentStatus(agentId: string): AgentStatus {
    try {
      validateUUID(agentId);

      const agent = this.getAgent(agentId);
      return agent.status;
    } catch (error) {
      const err = error as Error;
      this.logger.error('获取 Agent 状态失败', err, { agentId });
      throw new AgentManagerError(`获取 Agent 状态失败: ${err.message}`, agentId);
    }
  }

  /**
   * 更新智能体状态
   * @param agentId Agent ID
   * @param status 新状态
   * @returns 更新后的状态
   */
  public updateAgentStatus(agentId: string, status: AgentStatus): AgentStatus {
    try {
      validateUUID(agentId);

      // 状态值校验
      const validStatuses: AgentStatus[] = ['inactive', 'active', 'paused', 'error'];
      if (!validStatuses.includes(status)) {
        throw new AgentManagerError(`无效的 Agent 状态: ${status}`, agentId);
      }

      const sql = `UPDATE ${TABLE_NAMES.AGENT_INSTANCES} SET status = ?, updated_at = ? WHERE id = ?`;
      this.db.execute(sql, [status, this.getCurrentTime(), agentId]);

      // 记录审计日志
      this.logAction(agentId, 'status_updated', { status });

      this.logger.info('Agent 状态已更新', { agentId, status });

      return status;
    } catch (error) {
      const err = error as Error;
      this.logger.error('更新 Agent 状态失败', err, { agentId, status });
      throw new AgentManagerError(`更新 Agent 状态失败: ${err.message}`, agentId, { status });
    }
  }
}

/**
 * 默认单例实例
 */
export const agentManager = new AgentManager();

export default AgentManager;
