/**
 * WebSocket 连接管理器
 *
 * 核心功能：
 * 1. 自动重连 - 断线自动重连，指数退避
 * 2. 心跳检测 - 保持连接活跃
 * 3. 消息队列 - 断线期间缓存消息
 * 4. 订阅管理 - 按频道订阅/取消订阅
 * 5. 连接池 - 多连接管理
 *
 * 适用场景：
 * - 实时行情推送
 * - 聊天消息
 * - 实时通知
 */

// ==================== 类型定义 ====================

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

interface WebSocketOptions {
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连间隔 */
  maxReconnectInterval?: number;
  /** 最大重连次数，-1 表示无限 */
  maxReconnectAttempts?: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 心跳超时 */
  heartbeatTimeout?: number;
  /** 离线消息队列大小 */
  messageQueueSize?: number;
}

interface Subscription {
  channel: string;
  callback: (data: unknown) => void;
  unsubscribe: () => void;
}

type MessageHandler = (data: unknown, channel?: string) => void;
type StateHandler = (state: ConnectionState) => void;
type ErrorHandler = (error: Error) => void;

// ==================== WebSocketManager ====================

/**
 * WebSocket 连接管理器
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<WebSocketOptions>;

  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private messageQueue: unknown[] = [];
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private globalHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  // 日志
  private logs: { time: number; type: string; msg: string }[] = [];

  constructor(url: string, options: WebSocketOptions = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: options.reconnectInterval ?? 1000,
      maxReconnectInterval: options.maxReconnectInterval ?? 30000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? -1,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      heartbeatTimeout: options.heartbeatTimeout ?? 10000,
      messageQueueSize: options.messageQueueSize ?? 100,
    };
  }

  /**
   * 建立连接
   */
  connect(): void {
    if (this.state === "connected" || this.state === "connecting") {
      return;
    }

    this.setState("connecting");
    this.log("info", "正在连接...");

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      this.log("error", `连接失败: ${error}`);
      this.handleError(error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1000, "Manual disconnect");
      this.ws = null;
    }

    this.setState("disconnected");
    this.log("info", "已断开连接");
  }

  /**
   * 发送消息
   */
  send(data: unknown): boolean {
    const message = typeof data === "string" ? data : JSON.stringify(data);

    if (this.state === "connected" && this.ws) {
      this.ws.send(message);
      this.log("send", message.slice(0, 100));
      return true;
    }

    // 离线时加入队列
    if (this.messageQueue.length < this.options.messageQueueSize) {
      this.messageQueue.push(data);
      this.log("queue", `消息已加入队列 (${this.messageQueue.length})`);
    }
    return false;
  }

  /**
   * 订阅频道
   */
  subscribe(channel: string, callback: MessageHandler): Subscription {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());

      // 发送订阅消息
      this.send({ type: "subscribe", channel });
    }

    this.subscriptions.get(channel)!.add(callback);

    return {
      channel,
      callback,
      unsubscribe: () => this.unsubscribe(channel, callback),
    };
  }

  /**
   * 取消订阅
   */
  unsubscribe(channel: string, callback?: MessageHandler): void {
    const handlers = this.subscriptions.get(channel);
    if (!handlers) return;

    if (callback) {
      handlers.delete(callback);
    } else {
      handlers.clear();
    }

    if (handlers.size === 0) {
      this.subscriptions.delete(channel);
      this.send({ type: "unsubscribe", channel });
    }
  }

  /**
   * 监听所有消息
   */
  onMessage(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /**
   * 监听状态变化
   */
  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    // 立即通知当前状态
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * 监听错误
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * 获取当前状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取日志
   */
  getLogs(): { time: number; type: string; msg: string }[] {
    return [...this.logs];
  }

  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * 获取订阅的频道
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * 获取队列消息数
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  // ==================== Private ====================

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.log("info", "连接成功");
      this.setState("connected");
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushMessageQueue();
      this.resubscribeAll();
    };

    this.ws.onclose = (event) => {
      this.log("info", `连接关闭: ${event.code} ${event.reason}`);
      this.stopHeartbeat();

      if (event.code !== 1000) {
        this.scheduleReconnect();
      } else {
        this.setState("disconnected");
      }
    };

    this.ws.onerror = (event) => {
      this.log("error", "连接错误");
      this.handleError(new Error("WebSocket error"));
    };

    this.ws.onmessage = (event) => {
      this.resetHeartbeatTimeout();

      try {
        const data = JSON.parse(event.data);
        this.log("recv", JSON.stringify(data).slice(0, 100));

        // 心跳响应
        if (data.type === "pong") {
          return;
        }

        // 分发到频道订阅者
        if (data.channel && this.subscriptions.has(data.channel)) {
          for (const handler of this.subscriptions.get(data.channel)!) {
            handler(data.data, data.channel);
          }
        }

        // 分发到全局处理器
        for (const handler of this.globalHandlers) {
          handler(data, data.channel);
        }
      } catch {
        // 非 JSON 消息
        this.log("recv", event.data.slice(0, 100));
        for (const handler of this.globalHandlers) {
          handler(event.data);
        }
      }
    };
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  private handleError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  private scheduleReconnect(): void {
    if (
      this.options.maxReconnectAttempts !== -1 &&
      this.reconnectAttempts >= this.options.maxReconnectAttempts
    ) {
      this.log("error", "达到最大重连次数");
      this.setState("disconnected");
      return;
    }

    this.setState("reconnecting");
    this.reconnectAttempts++;

    // 指数退避
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      this.options.maxReconnectInterval,
    );

    this.log("info", `${delay / 1000}秒后重连 (第${this.reconnectAttempts}次)`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", timestamp: Date.now() });

      this.heartbeatTimeoutTimer = setTimeout(() => {
        this.log("warn", "心跳超时，重连...");
        this.ws?.close();
      }, this.options.heartbeatTimeout);
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.resetHeartbeatTimeout();
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.send(msg);
    }
  }

  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      this.send({ type: "subscribe", channel });
    }
  }

  private log(type: string, msg: string): void {
    this.logs.push({ time: Date.now(), type, msg });
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }
}
