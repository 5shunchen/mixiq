import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { defaultLogger as logger } from '../utils/logger';
import {
  Project,
  Environment,
  AgentInstance,
  Deployment,
  Workflow,
  WorkflowRun,
  TABLE_NAMES,
  UpdateInput,
  WithoutTimestampsAndId,
} from '../types';

/**
 * 数据库错误类
 */
export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly causeError?: Error;

  constructor(
    message: string,
    code?: string,
    cause?: Error
  ) {
    super(message);
    this.code = code;
    this.causeError = cause;
    this.name = 'DatabaseError';
  }
}

/**
 * 记录未找到错误类
 */
export class RecordNotFoundError extends DatabaseError {
  public readonly tableName?: string;
  public readonly recordId?: string;

  constructor(
    message: string,
    tableName?: string,
    id?: string
  ) {
    super(message);
    this.tableName = tableName;
    this.recordId = id;
    this.name = 'RecordNotFoundError';
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends DatabaseError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string
  ) {
    super(message);
    this.field = field;
    this.name = 'ValidationError';
  }
}

/**
 * 数据库表类型映射
 */
type TableTypeMap = {
  projects: Project;
  environments: Environment;
  agent_instances: AgentInstance;
  deployments: Deployment;
  workflows: Workflow;
  workflow_runs: WorkflowRun;
};

type TableName = keyof TableTypeMap;

/**
 * 查询选项
 */
export interface QueryOptions<T> {
  where?: Partial<Record<keyof T, unknown>>;
  orderBy?: keyof T;
  orderDirection?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  dbPath?: string;
  type?: 'sqlite' | 'postgres';
}

/**
 * 数据库类
 * 支持 SQLite，预留 PostgreSQL 扩展接口
 */
export class MixIQDatabase {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      type: 'sqlite',
      ...config,
    };
  }

  /**
   * 获取数据库路径
   * 优先使用环境变量 MIXIQ_DB_PATH，默认 ~/.mixiq/mixiq.db
   */
  private getDbPath(): string {
    if (this.config.dbPath) {
      return this.config.dbPath;
    }
    const envPath = process.env.MIXIQ_DB_PATH;
    if (envPath) {
      return envPath;
    }
    const homeDir = os.homedir();
    return path.join(homeDir, '.mixiq', 'mixiq.db');
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDirectory(dbPath: string): void {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`创建数据目录: ${dir}`);
      } catch (error) {
        throw new DatabaseError(
          `创建数据目录失败: ${dir}`,
          'MKDIR_FAILED',
          error as Error
        );
      }
    }
  }

  /**
   * 初始化数据库连接和表结构
   */
  public init(): void {
    if (this.isInitialized) {
      logger.warn('数据库已经初始化');
      return;
    }

    try {
      const dbPath = this.getDbPath();
      logger.info(`初始化数据库: ${dbPath}`);

      this.ensureDataDirectory(dbPath);

      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.createTables();

      this.isInitialized = true;
      logger.info('数据库初始化成功');
    } catch (error) {
      const err = error as Error;
      logger.error('数据库初始化失败', err, { error: err.message });
      throw new DatabaseError(
        `数据库初始化失败: ${err.message}`,
        'INIT_FAILED',
        err
      );
    }
  }

  /**
   * 创建必要的表
   */
  private createTables(): void {
    if (!this.db) {
      throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');
    }

    // projects 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.PROJECTS} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        git_remotes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_name ON ${TABLE_NAMES.PROJECTS}(name);
    `);

    // environments 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.ENVIRONMENTS} (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        servers TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES ${TABLE_NAMES.PROJECTS}(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_environments_project_id ON ${TABLE_NAMES.ENVIRONMENTS}(project_id);
      CREATE INDEX IF NOT EXISTS idx_environments_name ON ${TABLE_NAMES.ENVIRONMENTS}(name);
    `);

    // agent_instances 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.AGENT_INSTANCES} (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        token TEXT NOT NULL,
        allowed_tools TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'inactive',
        context TEXT NOT NULL DEFAULT '{}',
        history TEXT NOT NULL DEFAULT '[]',
        audit_logs TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES ${TABLE_NAMES.PROJECTS}(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_agent_instances_project_id ON ${TABLE_NAMES.AGENT_INSTANCES}(project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_instances_status ON ${TABLE_NAMES.AGENT_INSTANCES}(status);
    `);

    // deployments 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.DEPLOYMENTS} (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        env_name TEXT NOT NULL,
        branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        commit_sha TEXT NOT NULL,
        output TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES ${TABLE_NAMES.PROJECTS}(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON ${TABLE_NAMES.DEPLOYMENTS}(project_id);
      CREATE INDEX IF NOT EXISTS idx_deployments_status ON ${TABLE_NAMES.DEPLOYMENTS}(status);
      CREATE INDEX IF NOT EXISTS idx_deployments_env_name ON ${TABLE_NAMES.DEPLOYMENTS}(env_name);
    `);

    // workflows 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.WORKFLOWS} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        version TEXT NOT NULL DEFAULT '1.0.0',
        is_built_in INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        parameters TEXT NOT NULL DEFAULT '{}',
        steps TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflows_name ON ${TABLE_NAMES.WORKFLOWS}(name);
      CREATE INDEX IF NOT EXISTS idx_workflows_is_built_in ON ${TABLE_NAMES.WORKFLOWS}(is_built_in);
      CREATE INDEX IF NOT EXISTS idx_workflows_is_enabled ON ${TABLE_NAMES.WORKFLOWS}(is_enabled);
    `);

    // workflow_runs 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.WORKFLOW_RUNS} (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        project_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        parameters TEXT NOT NULL DEFAULT '{}',
        context TEXT NOT NULL DEFAULT '{}',
        steps TEXT NOT NULL DEFAULT '[]',
        result TEXT,
        error TEXT,
        error_stack TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms INTEGER,
        cancelled_at TEXT,
        cancelled_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES ${TABLE_NAMES.WORKFLOWS}(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES ${TABLE_NAMES.PROJECTS}(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON ${TABLE_NAMES.WORKFLOW_RUNS}(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_id ON ${TABLE_NAMES.WORKFLOW_RUNS}(project_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON ${TABLE_NAMES.WORKFLOW_RUNS}(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_start_time ON ${TABLE_NAMES.WORKFLOW_RUNS}(start_time);
    `);

    logger.debug('数据库表创建完成');
  }

  /**
   * 检查数据库是否已初始化
   */
  private checkInitialized(): void {
    if (!this.db || !this.isInitialized) {
      throw new DatabaseError('数据库未初始化，请先调用 init() 方法', 'NOT_INITIALIZED');
    }
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
   * 将对象中的 JSON 字段序列化
   */
  private serializeJsonFields(data: Record<string, unknown>): Record<string, unknown> {
    const result = { ...data };
    const jsonFields = [
      'git_remotes', 'servers', 'allowed_tools', 'context', 'history', 'audit_logs', 'config',
      'parameters', 'steps', 'tags', 'context', 'result'
    ];

    for (const field of jsonFields) {
      if (field in result && result[field] !== undefined && typeof result[field] !== 'string') {
        result[field] = JSON.stringify(result[field]);
      }
    }

    return result;
  }

  /**
   * 将数据库行转换为类型化对象
   */
  private deserializeRow<T>(row: Record<string, unknown>): T {
    const result: Record<string, unknown> = { ...row };
    const jsonFields = [
      'git_remotes', 'servers', 'allowed_tools', 'context', 'history', 'audit_logs', 'config',
      'parameters', 'steps', 'tags', 'result'
    ];

    for (const field of jsonFields) {
      if (field in result && typeof result[field] === 'string') {
        try {
          result[field] = JSON.parse(result[field] as string);
        } catch {
          // 如果解析失败，保持原始字符串
        }
      }
    }

    // 将时间字符串转换为 Date 对象
    const dateFields = ['created_at', 'updated_at', 'start_time', 'end_time', 'cancelled_at'];
    for (const field of dateFields) {
      if (field in result && typeof result[field] === 'string') {
        result[field] = new Date(result[field] as string);
      }
    }

    // 字段名映射（snake_case -> camelCase）
    const fieldMappings: Record<string, string> = {
      is_built_in: 'isBuiltIn',
      is_enabled: 'isEnabled',
      workflow_id: 'workflowId',
      workflow_name: 'workflowName',
      project_id: 'projectId',
      start_time: 'startTime',
      end_time: 'endTime',
      duration_ms: 'durationMs',
      cancelled_at: 'cancelledAt',
      cancelled_by: 'cancelledBy',
      error_stack: 'errorStack',
    };

    for (const [snakeCase, camelCase] of Object.entries(fieldMappings)) {
      if (snakeCase in result) {
        result[camelCase] = result[snakeCase];
        delete result[snakeCase];
      }
    }

    return result as unknown as T;
  }

  /**
   * 插入记录
   */
  public insert<T extends TableName>(
    tableName: T,
    data: WithoutTimestampsAndId<TableTypeMap[T]>
  ): TableTypeMap[T] {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      const id = this.generateId();
      const now = this.getCurrentTime();
      const serializedData = this.serializeJsonFields(data as Record<string, unknown>);

      const keys = Object.keys(serializedData);
      const placeholders = keys.map(() => '?').join(', ');
      const values = Object.values(serializedData);

      const sql = `
        INSERT INTO ${tableName} (id, ${keys.join(', ')}, created_at, updated_at)
        VALUES (?, ${placeholders}, ?, ?)
      `;

      const stmt = this.db.prepare(sql);
      stmt.run(id, ...values, now, now);

      return this.findById(tableName, id) as TableTypeMap[T];
    } catch (error) {
      const err = error as Error;
      logger.error(`插入记录失败 [${tableName}]`, err, { error: err.message });
      throw new DatabaseError(
        `插入记录失败: ${err.message}`,
        'INSERT_FAILED',
        err
      );
    }
  }

  /**
   * 更新记录
   */
  public update<T extends TableName>(
    tableName: T,
    id: string,
    data: UpdateInput<TableTypeMap[T]>
  ): TableTypeMap[T] {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    const existing = this.findById(tableName, id);
    if (!existing) {
      throw new RecordNotFoundError(
        `记录不存在: ${id}`,
        tableName,
        id
      );
    }

    try {
      const now = this.getCurrentTime();
      const serializedData = this.serializeJsonFields(data as Record<string, unknown>);

      const setClauses = Object.keys(serializedData)
        .map((key) => `${key} = ?`)
        .join(', ');

      if (!setClauses) {
        return existing as TableTypeMap[T];
      }

      const values = Object.values(serializedData);
      const sql = `
        UPDATE ${tableName}
        SET ${setClauses}, updated_at = ?
        WHERE id = ?
      `;

      const stmt = this.db.prepare(sql);
      stmt.run(...values, now, id);

      return this.findById(tableName, id) as TableTypeMap[T];
    } catch (error) {
      const err = error as Error;
      logger.error(`更新记录失败 [${tableName}:${id}]`, err, { error: err.message });
      throw new DatabaseError(
        `更新记录失败: ${err.message}`,
        'UPDATE_FAILED',
        err
      );
    }
  }

  /**
   * 删除记录
   */
  public delete<T extends TableName>(tableName: T, id: string): boolean {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      const sql = `DELETE FROM ${tableName} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(id);

      if (result.changes === 0) {
        logger.warn(`删除记录不存在 [${tableName}:${id}]`);
        return false;
      }

      logger.debug(`删除记录成功 [${tableName}:${id}]`);
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error(`删除记录失败 [${tableName}:${id}]`, err, { error: err.message });
      throw new DatabaseError(
        `删除记录失败: ${err.message}`,
        'DELETE_FAILED',
        err
      );
    }
  }

  /**
   * 根据 ID 查找记录
   */
  public findById<T extends TableName>(tableName: T, id: string): TableTypeMap[T] | null {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      const sql = `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`;
      const stmt = this.db.prepare(sql);
      const row = stmt.get(id) as Record<string, unknown> | undefined;

      if (!row) {
        return null;
      }

      return this.deserializeRow<TableTypeMap[T]>(row);
    } catch (error) {
      const err = error as Error;
      logger.error(`查询记录失败 [${tableName}:${id}]`, err, { error: err.message });
      throw new DatabaseError(
        `查询记录失败: ${err.message}`,
        'FIND_FAILED',
        err
      );
    }
  }

  /**
   * 获取所有记录
   */
  public findAll<T extends TableName>(
    tableName: T,
    options: QueryOptions<TableTypeMap[T]> = {}
  ): TableTypeMap[T][] {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      let sql = `SELECT * FROM ${tableName}`;
      const params: unknown[] = [];

      // WHERE 条件
      if (options.where && Object.keys(options.where).length > 0) {
        const whereClauses = Object.entries(options.where)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => {
            params.push(value);
            return `${key} = ?`;
          });

        if (whereClauses.length > 0) {
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
      }

      // ORDER BY
      if (options.orderBy) {
        const direction = options.orderDirection || 'DESC';
        sql += ` ORDER BY ${String(options.orderBy)} ${direction}`;
      } else {
        sql += ` ORDER BY created_at DESC`;
      }

      // LIMIT / OFFSET
      if (options.limit !== undefined) {
        sql += ` LIMIT ?`;
        params.push(options.limit);

        if (options.offset !== undefined) {
          sql += ` OFFSET ?`;
          params.push(options.offset);
        }
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as Record<string, unknown>[];

      return rows.map((row) => this.deserializeRow<TableTypeMap[T]>(row));
    } catch (error) {
      const err = error as Error;
      logger.error(`查询所有记录失败 [${tableName}]`, err, { error: err.message });
      throw new DatabaseError(
        `查询所有记录失败: ${err.message}`,
        'FIND_ALL_FAILED',
        err
      );
    }
  }

  /**
   * 自定义查询（返回数据）
   */
  public query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as T[];
      return rows;
    } catch (error) {
      const err = error as Error;
      logger.error('自定义查询失败', err, { sql, error: err.message });
      throw new DatabaseError(
        `自定义查询失败: ${err.message}`,
        'QUERY_FAILED',
        err
      );
    }
  }

  /**
   * 执行 SQL 语句（不返回数据，适用于 UPDATE/DELETE）
   */
  public execute(sql: string, params: unknown[] = []): void {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    try {
      const stmt = this.db.prepare(sql);
      stmt.run(...params);
    } catch (error) {
      const err = error as Error;
      logger.error('SQL 执行失败', err, { sql, error: err.message });
      throw new DatabaseError(
        `SQL 执行失败: ${err.message}`,
        'EXECUTE_FAILED',
        err
      );
    }
  }

  /**
   * 执行事务
   */
  public transaction<T>(callback: () => T): T {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');

    const runTransaction = this.db.transaction((fn: () => T) => {
      return fn();
    });

    try {
      return runTransaction(callback);
    } catch (error) {
      const err = error as Error;
      logger.error('事务执行失败', err, { error: err.message });
      throw new DatabaseError(
        `事务执行失败: ${err.message}`,
        'TRANSACTION_FAILED',
        err
      );
    }
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db && this.isInitialized) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('数据库连接已关闭');
    }
  }

  /**
   * 获取数据库实例（高级用法）
   */
  public getRawInstance(): Database.Database {
    this.checkInitialized();
    if (!this.db) throw new DatabaseError('数据库未初始化', 'NOT_INITIALIZED');
    return this.db;
  }

  /**
   * PostgreSQL 预留接口
   */
  public async connectPostgres(): Promise<void> {
    throw new DatabaseError(
      'PostgreSQL 支持尚未实现',
      'NOT_IMPLEMENTED'
    );
  }
}

/**
 * 单例实例
 */
export const db = new MixIQDatabase();

export default MixIQDatabase;
