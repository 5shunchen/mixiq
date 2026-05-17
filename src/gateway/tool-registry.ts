import { Logger } from '../utils/logger';
import {
  MCPToolDefinition,
  ToolHandler,
  RegisteredTool,
  MCP_TOOL_ERROR_CODES,
} from '../types';

/**
 * 工具执行错误类
 */
export class ToolExecutionError extends Error {
  public readonly toolName: string;
  public readonly code: number;

  constructor(
    message: string,
    toolName: string,
    code: number = MCP_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED
  ) {
    super(message);
    Object.defineProperty(this, 'name', {
      value: 'ToolExecutionError',
      enumerable: false,
    });
    this.toolName = toolName;
    this.code = code;
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

/**
 * 工具未找到错误类
 */
export class ToolNotFoundError extends ToolExecutionError {
  constructor(toolName: string) {
    super(`工具不存在: ${toolName}`, toolName, MCP_TOOL_ERROR_CODES.TOOL_NOT_FOUND);
    Object.defineProperty(this, 'name', {
      value: 'ToolNotFoundError',
      enumerable: false,
    });
  }
}

/**
 * 工具注册表类
 * 负责管理所有注册的 MCP 工具及其处理器
 */
export class ToolRegistry {
  private readonly tools: Map<string, RegisteredTool> = new Map();
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('tool-registry');
  }

  /**
   * 注册工具
   * @param definition 工具定义
   * @param handler 工具处理函数
   * @throws 如果工具已存在或定义无效
   */
  public registerTool(definition: MCPToolDefinition, handler: ToolHandler): void {
    this.validateToolDefinition(definition);

    if (this.tools.has(definition.name)) {
      const errorMessage = `工具名称冲突: ${definition.name}`;
      this.logger.warn(errorMessage);
      throw new ToolExecutionError(errorMessage, definition.name);
    }

    this.tools.set(definition.name, {
      definition,
      handler,
    });

    this.logger.info('工具注册成功', { toolName: definition.name });
  }

  /**
   * 验证工具定义的有效性
   * @param definition 工具定义
   * @throws 如果定义无效
   */
  private validateToolDefinition(definition: MCPToolDefinition): void {
    if (!definition.name || typeof definition.name !== 'string') {
      throw new ToolExecutionError(
        '工具名称必须是有效的字符串',
        definition.name || 'unknown'
      );
    }

    if (!definition.description || typeof definition.description !== 'string') {
      throw new ToolExecutionError(
        '工具描述必须是有效的字符串',
        definition.name
      );
    }

    if (!definition.inputSchema || definition.inputSchema.type !== 'object') {
      throw new ToolExecutionError(
        '工具的 inputSchema 必须是 object 类型',
        definition.name
      );
    }

    if (!definition.inputSchema.properties) {
      throw new ToolExecutionError(
        '工具的 inputSchema 必须包含 properties 字段',
        definition.name
      );
    }
  }

  /**
   * 获取工具定义
   * @param name 工具名称
   * @returns 工具定义，如果不存在返回 null
   */
  public getTool(name: string): MCPToolDefinition | null {
    const registeredTool = this.tools.get(name);
    if (!registeredTool) {
      return null;
    }
    return registeredTool.definition;
  }

  /**
   * 列出所有已注册的工具
   * @returns 工具定义数组
   */
  public listTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  /**
   * 执行工具
   * @param name 工具名称
   * @param params 工具参数
   * @returns 工具执行结果
   * @throws 如果工具不存在或执行失败
   */
  public async executeTool(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const registeredTool = this.tools.get(name);
    if (!registeredTool) {
      this.logger.warn('尝试执行不存在的工具', { toolName: name });
      throw new ToolNotFoundError(name);
    }

    this.logger.debug('开始执行工具', { toolName: name });

    try {
      const result = await registeredTool.handler(params);
      this.logger.debug('工具执行成功', { toolName: name });
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error('工具执行失败', err, {
        toolName: name,
        params: JSON.stringify(params),
      });

      if (error instanceof ToolExecutionError) {
        throw error;
      }

      throw new ToolExecutionError(
        `工具执行失败: ${err.message}`,
        name,
        MCP_TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED
      );
    }
  }

  /**
   * 检查工具是否已注册
   * @param name 工具名称
   * @returns 是否已注册
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 注销工具
   * @param name 工具名称
   * @returns 是否成功注销
   */
  public unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      this.logger.info('工具已注销', { toolName: name });
    }
    return existed;
  }

  /**
   * 清空所有已注册的工具
   */
  public clear(): void {
    this.tools.clear();
    this.logger.info('所有工具已清空');
  }

  /**
   * 获取已注册工具的数量
   * @returns 工具数量
   */
  public size(): number {
    return this.tools.size;
  }
}

/**
 * 默认单例实例
 */
export const defaultToolRegistry = new ToolRegistry();

export default ToolRegistry;
