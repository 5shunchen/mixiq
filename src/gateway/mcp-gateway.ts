import { Logger } from '../utils/logger';
import ToolRegistry from './tool-registry';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcBatchResponse,
  JsonRpcError,
  JSON_RPC_ERROR_CODES,
  MCPToolDefinition,
} from '../types';

/**
 * MCP 网关类
 * 负责处理 JSON-RPC 2.0 请求，路由到对应工具执行，返回标准响应
 */
export class MCPGateway {
  private readonly toolRegistry: ToolRegistry;
  private readonly logger: Logger;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    this.logger = new Logger('mcp-gateway');
  }

  /**
   * 处理 JSON-RPC 请求
   * @param rawRequest 原始请求数据
   * @returns JSON-RPC 响应
   */
  public async handleRequest(rawRequest: unknown): Promise<JsonRpcResponse | JsonRpcBatchResponse | null> {
    this.logger.debug('收到请求', { request: JSON.stringify(rawRequest) });

    // 处理批量请求
    if (Array.isArray(rawRequest)) {
      return this.handleBatchRequest(rawRequest);
    }

    // 处理单个请求
    try {
      return await this.handleSingleRequest(rawRequest);
    } catch (error) {
      const err = error as Error;
      this.logger.error('请求处理失败', err);
      return this.createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        '内部服务器错误',
        err.message
      );
    }
  }

  /**
   * 处理批量请求
   * @param requests 请求数组
   * @returns 批量响应
   */
  private async handleBatchRequest(requests: unknown[]): Promise<JsonRpcBatchResponse | null> {
    if (requests.length === 0) {
      this.logger.warn('收到空的批量请求');
      return [
        this.createErrorResponse(
          null,
          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          '批量请求不能为空'
        ) as JsonRpcResponse,
      ];
    }

    const responses: JsonRpcResponse[] = [];

    for (const request of requests) {
      const response = await this.handleSingleRequest(request);
      if (response) {
        responses.push(response);
      }
    }

    return responses.length > 0 ? responses : null;
  }

  /**
   * 处理单个请求
   * @param rawRequest 原始请求数据
   * @returns JSON-RPC 响应，如果是通知则返回 null
   */
  private async handleSingleRequest(rawRequest: unknown): Promise<JsonRpcResponse | null> {
    // 1. 解析和验证请求格式
    const validation = this.validateJsonRpcRequest(rawRequest);
    if (!validation.valid) {
      return this.createErrorResponse(
        validation.id,
        validation.errorCode!,
        validation.errorMessage!
      );
    }

    const request = validation.request!;
    const isNotification = request.id === null;

    try {
      // 2. 路由到对应方法
      const result = await this.routeRequest(request);

      // 通知不需要返回响应
      if (isNotification) {
        return null;
      }

      return this.createSuccessResponse(request.id, result);
    } catch (error) {
      const err = error as Error;
      this.logger.error('方法执行失败', err, { method: request.method });

      if (isNotification) {
        return null;
      }

      const errorCode = this.extractErrorCode(error);
      return this.createErrorResponse(
        request.id,
        errorCode,
        err.message
      );
    }
  }

  /**
   * 验证 JSON-RPC 请求格式
   */
  private validateJsonRpcRequest(rawRequest: unknown): {
    valid: boolean;
    request?: JsonRpcRequest;
    id: string | number | null;
    errorCode?: number;
    errorMessage?: string;
  } {
    // 检查是否是对象
    if (!rawRequest || typeof rawRequest !== 'object') {
      return {
        valid: false,
        id: null,
        errorCode: JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        errorMessage: '请求必须是 JSON 对象',
      };
    }

    const req = rawRequest as Record<string, unknown>;

    // 提取 ID（如果存在）
    let id: string | number | null = null;
    if ('id' in req) {
      if (typeof req.id === 'string' || typeof req.id === 'number') {
        id = req.id;
      }
    }

    // 检查 jsonrpc 版本
    if (req.jsonrpc !== '2.0') {
      return {
        valid: false,
        id,
        errorCode: JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        errorMessage: 'jsonrpc 字段必须为 "2.0"',
      };
    }

    // 检查 method 字段
    if (!req.method || typeof req.method !== 'string') {
      return {
        valid: false,
        id,
        errorCode: JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        errorMessage: 'method 字段必须是有效的字符串',
      };
    }

    // 检查 params 字段（如果有）
    if ('params' in req && req.params !== undefined) {
      if (typeof req.params !== 'object' || req.params === null || Array.isArray(req.params)) {
        return {
          valid: false,
          id,
          errorCode: JSON_RPC_ERROR_CODES.INVALID_PARAMS,
          errorMessage: 'params 字段必须是对象',
        };
      }
    }

    return {
      valid: true,
      id,
      request: {
        jsonrpc: '2.0',
        id,
        method: req.method,
        params: req.params as Record<string, unknown> | undefined,
      },
    };
  }

  /**
   * 路由请求到对应处理方法
   */
  private async routeRequest(request: JsonRpcRequest): Promise<unknown> {
    const { method, params = {} } = request;

    // MCP 标准方法
    switch (method) {
      case 'tools/list':
        return this.handleListTools();
      case 'tools/call':
        return this.handleCallTool(params);
      case 'initialize':
        return this.handleInitialize(params);
      case 'notifications/initialized':
        return this.handleInitialized();
      default:
        // 尝试直接调用工具
        if (this.toolRegistry.hasTool(method)) {
          return this.toolRegistry.executeTool(method, params);
        }
        throw new Error(`方法不存在: ${method}`);
    }
  }

  /**
   * 处理工具列表请求
   */
  private handleListTools(): { tools: MCPToolDefinition[] } {
    const tools = this.toolRegistry.listTools();
    this.logger.debug('返回工具列表', { count: tools.length });
    return { tools };
  }

  /**
   * 处理工具调用请求
   */
  private async handleCallTool(params: Record<string, unknown>): Promise<unknown> {
    const toolName = params.name as string;
    const toolParams = params.arguments as Record<string, unknown> || {};

    if (!toolName) {
      throw new Error('缺少工具名称参数 (name)');
    }

    return this.toolRegistry.executeTool(toolName, toolParams);
  }

  /**
   * 处理初始化请求
   */
  private handleInitialize(params: Record<string, unknown>): {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    serverInfo: { name: string; version: string };
  } {
    this.logger.info('收到初始化请求', {
      protocolVersion: params.protocolVersion,
      clientInfo: params.clientInfo,
    });

    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'mixiq',
        version: '0.1.0',
      },
    };
  }

  /**
   * 处理初始化完成通知
   */
  private handleInitialized(): void {
    this.logger.info('客户端初始化完成');
  }

  /**
   * 创建成功响应
   */
  private createSuccessResponse(
    id: string | number | null,
    result: unknown
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    const error: JsonRpcError = {
      code,
      message,
    };

    if (data !== undefined) {
      error.data = data;
    }

    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }

  /**
   * 从错误对象中提取错误码
   */
  private extractErrorCode(error: unknown): number {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: unknown }).code;
      if (typeof code === 'number') {
        return code;
      }
    }

    if (error instanceof Error && error.message.includes('不存在')) {
      return JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND;
    }

    if (error instanceof Error && error.message.includes('参数')) {
      return JSON_RPC_ERROR_CODES.INVALID_PARAMS;
    }

    return JSON_RPC_ERROR_CODES.INTERNAL_ERROR;
  }

  /**
   * 解析 JSON 请求体
   * @param body 请求体字符串
   * @returns 解析后的对象
   * @throws 如果解析失败
   */
  public parseRequestBody(body: string): unknown {
    try {
      return JSON.parse(body);
    } catch (error) {
      this.logger.warn('JSON 解析失败', { body });
      throw new Error('请求体不是有效的 JSON');
    }
  }
}

export default MCPGateway;
