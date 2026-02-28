'use client'

import { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from 'react'

// ==================== 类型定义 ====================
type TabType = 'problem' | 'bad' | 'good' | 'demo'
type ScenarioType = 
  // 第一批：用户提到的
  | 'toolbar' | 'cart' | 'form' | 'undo' | 'permission'
  // 第二批：我补充的业务场景
  | 'table' | 'drag' | 'collab' | 'wizard' | 'upload'
  // 第三批：架构模式
  | 'onion' | 'ioc' | 'ratelimit' | 'plugin' | 'state-sync'
  // 第四批：领域场景
  | 'seckill' | 'price-engine' | 'realtime-data' | 'transaction'
  // 第五批：更多架构模式
  | 'eventbus' | 'strategy' | 'pipeline' | 'scheduler'
  // 第六批：更多领域场景
  | 'im' | 'approval' | 'report'
  // 第七批：电商核心场景
  | 'sku-selector' | 'coupon-stack' | 'inventory-lock'
  // 第八批：金融核心场景
  | 'account-freeze' | 'distributed-id' | 'quote-merge'
  // 第九批：企业级场景
  | 'data-permission' | 'audit-trail' | 'multi-tenant'

interface Scenario {
  id: ScenarioType
  title: string
  subtitle: string
  difficulty: number
  tags: string[]
  problem: string
  badCode: string
  goodCode: string
  designPattern: string
  category?: string
}

// ==================== 代码高亮组件 ====================
function CodeBlock({ code, type }: { code: string; type: 'bad' | 'good' }) {
  const bgColor = type === 'bad' ? 'bg-red-950/30' : 'bg-green-950/30'
  const borderColor = type === 'bad' ? 'border-red-500/30' : 'border-green-500/30'
  const headerColor = type === 'bad' ? 'text-red-400' : 'text-green-400'
  
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <div className={`px-4 py-2 border-b ${borderColor} flex items-center gap-2`}>
        <span className={`text-sm font-medium ${headerColor}`}>
          {type === 'bad' ? '💩 烂代码 - 别这样写' : '✨ 优雅设计 - 值得学习'}
        </span>
      </div>
      <pre className="p-4 text-sm overflow-x-auto max-h-[500px]">
        <code className="text-gray-300 whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}

// ==================== 场景数据 ====================
const scenarios: Scenario[] = [
  // ==================== 架构模式篇（核心！） ====================
  {
    id: 'onion',
    title: '洋葱模型/中间件链',
    subtitle: 'Koa核心思想在前端的应用',
    difficulty: 5,
    tags: ['洋葱模型', '中间件', '责任链'],
    category: '架构模式',
    problem: `洋葱模型是Koa的核心，但它的应用远不止后端：

**前端实际应用场景：**

1. **权限校验链** - 登录检查 → 角色检查 → 权限检查 → 资源检查
2. **请求处理链** - 参数校验 → 限流 → 缓存 → 请求 → 响应处理
3. **埋点统计链** - 开始计时 → 请求 → 记录耗时 → 上报
4. **日志记录链** - 请求日志 → 业务处理 → 响应日志
5. **错误处理链** - 捕获错误 → 转换格式 → 通知用户 → 上报

**为什么需要洋葱模型？**

传统方式的痛点：
- 每个功能都要写 try-finally
- 日志、埋点代码散落各处
- 新增切面逻辑要改很多地方
- 无法统一管理横切关注点

典型烂代码特征：
- 每个接口都重复写日志、埋点、错误处理
- 业务逻辑和基础设施代码混在一起
- 加一个新功能（如性能监控）要改 N 处`,
    badCode: `// ❌ 典型屎山：每个接口都重复写一遍
async function fetchUserInfo(userId) {
  const startTime = Date.now()
  console.log('[Request] fetchUserInfo start', { userId })
  
  try {
    // 权限检查
    if (!isLoggedIn()) {
      throw new Error('未登录')
    }
    if (!hasPermission('user:read')) {
      throw new Error('无权限')
    }
    
    // 缓存检查
    const cached = localStorage.getItem(\`user_\${userId}\`)
    if (cached) {
      console.log('[Cache] hit', { userId })
      trackEvent('cache_hit', { api: 'fetchUserInfo' })
      return JSON.parse(cached)
    }
    
    // 发起请求
    const response = await fetch(\`/api/user/\${userId}\`)
    if (!response.ok) {
      throw new Error(\`请求失败: \${response.status}\`)
    }
    const data = await response.json()
    
    // 缓存结果
    localStorage.setItem(\`user_\${userId}\`, JSON.stringify(data))
    
    // 埋点
    trackEvent('api_success', { 
      api: 'fetchUserInfo', 
      duration: Date.now() - startTime 
    })
    
    console.log('[Request] fetchUserInfo success', { userId })
    return data
    
  } catch (error) {
    // 错误处理
    console.error('[Error] fetchUserInfo failed', error)
    trackEvent('api_error', { api: 'fetchUserInfo', error: error.message })
    reportError(error)
    throw error
  } finally {
    console.log('[Request] fetchUserInfo end', { 
      duration: Date.now() - startTime 
    })
  }
}

// 另一个接口，几乎一样的代码再来一遍...
async function fetchOrderList(params) {
  const startTime = Date.now()
  console.log('[Request] fetchOrderList start', { params })
  
  try {
    if (!isLoggedIn()) throw new Error('未登录')
    if (!hasPermission('order:read')) throw new Error('无权限')
    
    // ... 又是重复的缓存检查、请求、埋点、错误处理
  } catch (error) {
    // ... 又是重复的错误处理
  }
}

// 问题：
// 1. 100个接口就要写100遍
// 2. 加一个"请求签名"功能要改100处
// 3. 业务逻辑只有几行，却被大量基础设施代码包围
// 4. 漏掉某个埋点/日志，排查困难`,
    goodCode: `// ✅ 优雅设计：洋葱模型 + 中间件链

// 1. 洋葱模型核心实现
type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>

class Onion<T> {
  private middlewares: Middleware<T>[] = []

  use(middleware: Middleware<T>) {
    this.middlewares.push(middleware)
    return this  // 链式调用
  }

  async execute(ctx: T) {
    const middlewares = this.middlewares.slice()
    
    // 核心递归：从外到内，再从内到外
    const dispatch = (index: number): Promise<void> => {
      if (index >= middlewares.length) return Promise.resolve()
      
      const middleware = middlewares[index]
      return middleware(ctx, () => dispatch(index + 1))
    }
    
    await dispatch(0)
  }
}

// 2. 请求上下文
interface RequestContext {
  request: {
    url: string
    method: string
    params: any
    headers: Record<string, string>
  }
  response: {
    status: number
    data: any
    headers: Record<string, string>
  }
  state: {
    startTime: number
    fromCache: boolean
    retryCount: number
    [key: string]: any
  }
}

// 3. 定义中间件（每个职责单一）

// 日志中间件
const loggerMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const { request } = ctx
  console.log(\`[Request] \${request.method} \${request.url}\`, request.params)
  
  const startTime = Date.now()
  try {
    await next()  // 继续往里走
  } finally {
    // 响应回来后执行（洋葱的内层返回）
    const duration = Date.now() - startTime
    console.log(\`[Response] \${request.url}\`, { 
      status: ctx.response.status,
      duration: \`\${duration}ms\`,
      fromCache: ctx.state.fromCache
    })
  }
}

// 限流中间件
const rateLimitMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const key = \`\${ctx.request.method}:\${ctx.request.url}\`
  if (!rateLimiter.tryAcquire(key)) {
    ctx.response.status = 429
    ctx.response.data = { error: '请求过于频繁' }
    return  // 不调用 next，终止链条
  }
  await next()
}

// 权限中间件
const authMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  if (!isLoggedIn()) {
    ctx.response.status = 401
    ctx.response.data = { error: '请先登录' }
    return
  }
  
  const permission = getRequiredPermission(ctx.request.url)
  if (permission && !hasPermission(permission)) {
    ctx.response.status = 403
    ctx.response.data = { error: '无权限访问' }
    return
  }
  
  await next()
}

// 缓存中间件
const cacheMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const cacheKey = getCacheKey(ctx.request)
  const cached = cache.get(cacheKey)
  
  if (cached && !isExpired(cached)) {
    ctx.response = cached.response
    ctx.state.fromCache = true
    return  // 命中缓存，不继续往下
  }
  
  await next()  // 未命中，继续请求
  
  // 响应回来后缓存（洋葱返回阶段）
  if (ctx.response.status === 200) {
    cache.set(cacheKey, {
      response: ctx.response,
      timestamp: Date.now()
    })
  }
}

// 重试中间件
const retryMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const maxRetry = 3
  let lastError: Error
  
  for (let i = 0; i < maxRetry; i++) {
    try {
      ctx.state.retryCount = i
      await next()
      return  // 成功，退出
    } catch (error) {
      lastError = error
      if (!isRetryable(error)) break
      await delay(1000 * Math.pow(2, i))  // 指数退避
    }
  }
  
  throw lastError
}

// 埋点中间件
const trackingMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const startTime = Date.now()
  
  try {
    await next()
    
    // 成功埋点
    trackEvent('api_success', {
      url: ctx.request.url,
      method: ctx.request.method,
      status: ctx.response.status,
      duration: Date.now() - startTime,
      fromCache: ctx.state.fromCache
    })
  } catch (error) {
    // 失败埋点
    trackEvent('api_error', {
      url: ctx.request.url,
      error: error.message,
      duration: Date.now() - startTime
    })
    throw error
  }
}

// 实际请求中间件
const fetchMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  await next()  // 先让其他中间件处理完
  
  // 执行实际请求
  const response = await fetch(ctx.request.url, {
    method: ctx.request.method,
    headers: ctx.request.headers,
    body: JSON.stringify(ctx.request.params)
  })
  
  ctx.response = {
    status: response.status,
    data: await response.json(),
    headers: Object.fromEntries(response.headers.entries())
  }
}

// 4. 组装请求客户端
const httpClient = new Onion<RequestContext>()
  .use(loggerMiddleware)      // 最外层：日志
  .use(trackingMiddleware)    // 埋点
  .use(rateLimitMiddleware)   // 限流
  .use(authMiddleware)        // 权限
  .use(cacheMiddleware)       // 缓存
  .use(retryMiddleware)       // 重试
  .use(fetchMiddleware)       // 最内层：实际请求

// 5. 使用：业务代码极简
async function fetchUserInfo(userId: string) {
  const ctx: RequestContext = {
    request: {
      url: \`/api/user/\${userId}\`,
      method: 'GET',
      params: { userId },
      headers: {}
    },
    response: { status: 0, data: null, headers: {} },
    state: { startTime: Date.now(), fromCache: false, retryCount: 0 }
  }
  
  await httpClient.execute(ctx)
  
  if (ctx.response.status !== 200) {
    throw new Error(ctx.response.data.error)
  }
  
  return ctx.response.data
}

// 6. 新增功能只需添加中间件，无需改动任何业务代码！
// 比如加个"请求签名"功能：
const signatureMiddleware: Middleware<RequestContext> = async (ctx, next) => {
  const signature = generateSignature(ctx.request)
  ctx.request.headers['X-Signature'] = signature
  await next()
}

httpClient.use(signatureMiddleware)  // 一行搞定！

// 🎯 核心价值：
// 1. 横切关注点统一管理
// 2. 业务代码纯净，只关注业务
// 3. 新增功能零侵入
// 4. 中间件可复用、可测试
// 5. 执行顺序清晰可控`,
    designPattern: '洋葱模型 + 中间件模式 + 责任链模式'
  },
  {
    id: 'ioc',
    title: '控制反转(IoC)与依赖注入',
    subtitle: '解耦复杂系统的核心思想',
    difficulty: 5,
    tags: ['IoC', '依赖注入', '服务定位器'],
    category: '架构模式',
    problem: `控制反转是后端框架的核心，但前端同样需要：

**前端实际痛点：**

1. **服务依赖混乱** - A服务依赖B，B依赖C，C又依赖A
2. **测试困难** - new Service() 写死依赖，没法 mock
3. **配置散落** - baseUrl、timeout 散落在各处
4. **模块耦合** - 换个存储方式要改 N 个文件
5. **单例管理** - 全局变量满天飞

**典型场景：**
- 一个用户服务依赖：HTTP客户端、缓存、日志、事件总线、权限服务...
- 换一个 HTTP 库（axios → fetch）要改几十个文件
- 单元测试时无法替换真实服务

典型烂代码特征：
- 到处 new Service()
- import 穿透（深层依赖）
- 全局变量管理单例`,
    badCode: `// ❌ 典型屎山：依赖写死在代码里

// user-service.ts
import { HttpClient } from './http-client'
import { CacheService } from './cache-service'
import { Logger } from './logger'
import { EventBus } from './event-bus'
import { AuthService } from './auth-service'

class UserService {
  private http = new HttpClient('https://api.example.com')  // 写死
  private cache = new CacheService()  // 写死
  private logger = new Logger()  // 写死
  private eventBus = new EventBus()  // 写死
  private auth = new AuthService()  // 写死
  
  async getUser(id: string) {
    this.logger.info('getUser', { id })
    
    const cached = this.cache.get(\`user_\${id}\`)
    if (cached) return cached
    
    const user = await this.http.get(\`/user/\${id}\`)
    this.cache.set(\`user_\${id}\`, user)
    
    this.eventBus.emit('user:loaded', user)
    return user
  }
}

// 问题1: 测试困难
// 怎么 mock HttpClient？没法注入！
test('getUser', async () => {
  const service = new UserService()  // 会发起真实请求
  // ...
})

// 问题2: 配置散落
// 想改 baseUrl？要改每个 Service 文件
// 想换 HTTP 库？要改每个 import

// 问题3: 循环依赖
// AuthService 也依赖 UserService 怎么办？
class AuthService {
  private userService = new UserService()  // 💥 循环依赖报错
}

// 问题4: 单例管理混乱
// 每次都 new，还是用全局变量？
// window.userService = new UserService()  // 污染全局
// 或者用单例模式，每个服务都要写一遍 getInstance()

// 问题5: 模块穿透
// 一个深层组件突然需要 Logger
// 要从顶层一层层传 props，或者重新 new`,
    goodCode: `// ✅ 优雅设计：IoC容器 + 依赖注入

// 1. 服务接口定义（依赖抽象，不依赖具体）
interface IHttpClient {
  get<T>(url: string): Promise<T>
  post<T>(url: string, data: any): Promise<T>
}

interface ICache {
  get<T>(key: string): T | null
  set(key: string, value: any, ttl?: number): void
  delete(key: string): void
}

interface ILogger {
  info(message: string, data?: any): void
  error(message: string, error?: Error): void
}

interface IEventBus {
  emit(event: string, data: any): void
  on(event: string, handler: (data: any) => void): void
}

interface IUserService {
  getUser(id: string): Promise<User>
  updateUser(user: User): Promise<void>
}

// 2. 服务标识符（Token）
const Tokens = {
  HttpClient: Symbol('HttpClient'),
  Cache: Symbol('Cache'),
  Logger: Symbol('Logger'),
  EventBus: Symbol('EventBus'),
  UserService: Symbol('UserService'),
  AuthService: Symbol('AuthService'),
  Config: Symbol('Config'),
} as const

// 3. IoC 容器
class Container {
  private services = new Map<symbol, any>()
  private factories = new Map<symbol, () => any>()
  private singletons = new Map<symbol, any>()

  // 注册单例
  singleton<T>(token: symbol, factory: () => T) {
    this.factories.set(token, () => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory())
      }
      return this.singletons.get(token)
    })
    return this
  }

  // 注册瞬态（每次新建）
  transient<T>(token: symbol, factory: () => T) {
    this.factories.set(token, factory)
    return this
  }

  // 注册实例
  instance<T>(token: symbol, instance: T) {
    this.services.set(token, instance)
    return this
  }

  // 解析依赖
  resolve<T>(token: symbol): T {
    // 优先返回已注册的实例
    if (this.services.has(token)) {
      return this.services.get(token)
    }
    
    // 通过工厂创建
    if (this.factories.has(token)) {
      return this.factories.get(token)()
    }
    
    throw new Error(\`Service not found: \${token.toString()}\`)
  }

  // 创建子容器（作用域隔离）
  createChildScope(): Container {
    const child = new Container()
    child.factories = new Map(this.factories)
    child.singletons = this.singletons  // 共享单例
    return child
  }
}

// 4. 依赖注入装饰器（可选，更优雅）
function Injectable(token: symbol) {
  return function (constructor: Function) {
    constructor.prototype.__injectToken = token
  }
}

function Inject(token: symbol) {
  return function (target: any, propertyKey: string) {
    Object.defineProperty(target, propertyKey, {
      get: () => container.resolve(token)
    })
  }
}

// 5. 服务实现
class HttpClient implements IHttpClient {
  constructor(private config: { baseUrl: string; timeout: number }) {}
  
  async get<T>(url: string): Promise<T> {
    const response = await fetch(\`\${this.config.baseUrl}\${url}\`, {
      signal: AbortSignal.timeout(this.config.timeout)
    })
    return response.json()
  }
  
  async post<T>(url: string, data: any): Promise<T> {
    const response = await fetch(\`\${this.config.baseUrl}\${url}\`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return response.json()
  }
}

class UserService implements IUserService {
  // 构造函数注入
  constructor(
    private http: IHttpClient,
    private cache: ICache,
    private logger: ILogger,
    private eventBus: IEventBus
  ) {}
  
  async getUser(id: string): Promise<User> {
    this.logger.info('getUser', { id })
    
    const cached = this.cache.get<User>(\`user_\${id}\`)
    if (cached) return cached
    
    const user = await this.http.get<User>(\`/user/\${id}\`)
    this.cache.set(\`user_\${id}\`, user, 300000)
    
    this.eventBus.emit('user:loaded', user)
    return user
  }
  
  async updateUser(user: User): Promise<void> {
    await this.http.post(\`/user/\${user.id}\`, user)
    this.cache.delete(\`user_\${user.id}\`)
    this.eventBus.emit('user:updated', user)
  }
}

// 6. 容器配置（统一管理所有依赖）
const container = new Container()

// 配置
container.instance(Tokens.Config, {
  apiBaseUrl: process.env.API_BASE_URL || 'https://api.example.com',
  apiTimeout: 10000,
  cacheTTL: 300000
})

// 基础设施服务
container.singleton(Tokens.HttpClient, () => {
  const config = container.resolve(Tokens.Config)
  return new HttpClient({
    baseUrl: config.apiBaseUrl,
    timeout: config.apiTimeout
  })
})

container.singleton(Tokens.Cache, () => new MemoryCache())
container.singleton(Tokens.Logger, () => new ConsoleLogger())
container.singleton(Tokens.EventBus, () => new EventEmitter())

// 业务服务（依赖自动注入）
container.singleton(Tokens.UserService, () => {
  return new UserService(
    container.resolve(Tokens.HttpClient),
    container.resolve(Tokens.Cache),
    container.resolve(Tokens.Logger),
    container.resolve(Tokens.EventBus)
  )
})

// 7. React Hook 集成
const ContainerContext = createContext<Container>(container)

function useService<T>(token: symbol): T {
  const container = useContext(ContainerContext)
  return container.resolve<T>(token)
}

// 8. 组件使用
function UserProfile({ userId }: { userId: string }) {
  const userService = useService<IUserService>(Tokens.UserService)
  const logger = useService<ILogger>(Tokens.Logger)
  
  const [user, setUser] = useState<User | null>(null)
  
  useEffect(() => {
    userService.getUser(userId)
      .then(setUser)
      .catch(err => logger.error('Failed to load user', err))
  }, [userId])
  
  return <div>{user?.name}</div>
}

// 9. 测试时轻松 Mock
const testContainer = new Container()
  .instance(Tokens.HttpClient, mockHttpClient)
  .instance(Tokens.Cache, mockCache)
  .instance(Tokens.Logger, mockLogger)
  .instance(Tokens.EventBus, mockEventBus)
  .singleton(Tokens.UserService, () => new UserService(
    testContainer.resolve(Tokens.HttpClient),
    testContainer.resolve(Tokens.Cache),
    testContainer.resolve(Tokens.Logger),
    testContainer.resolve(Tokens.EventBus)
  ))

test('getUser', async () => {
  mockHttpClient.get.mockResolvedValue({ id: '1', name: 'Test' })
  
  const userService = testContainer.resolve<IUserService>(Tokens.UserService)
  const user = await userService.getUser('1')
  
  expect(user.name).toBe('Test')
})

// 10. 换实现只需改容器配置
// 换 HTTP 库？只改一处
container.singleton(Tokens.HttpClient, () => new AxiosHttpClient(config))
// 换缓存？只改一处
container.singleton(Tokens.Cache, () => new IndexedDBCache())

// 🎯 核心价值：
// 1. 依赖解耦，换实现只改一处
// 2. 测试友好，轻松 mock
// 3. 配置集中管理
// 4. 解决循环依赖（延迟解析）
// 5. 单例自动管理`,
    designPattern: '控制反转(IoC) + 依赖注入(DI) + 服务定位器'
  },
  {
    id: 'ratelimit',
    title: '限流与熔断',
    subtitle: '令牌桶/漏桶算法保护系统',
    difficulty: 5,
    tags: ['令牌桶', '漏桶', '熔断器'],
    category: '架构模式',
    problem: `前端也需要限流！不是只有后端才用：

**前端限流场景：**

1. **API请求限流** - 防止用户疯狂点击，保护后端
2. **搜索输入限流** - 每输入一个字都请求？服务器爆炸
3. **滚动事件限流** - scroll 事件每秒触发几百次
4. **按钮防抖** - 支付按钮连点，发多次请求
5. **WebSocket消息限流** - 防止消息洪泛

**为什么需要令牌桶/漏桶？**

普通的 debounce/throttle 不够用：
- debounce：最后执行，但用户可能等不及
- throttle：固定频率，但无法应对突发流量
- 令牌桶：允许一定程度的突发，更灵活

典型烂代码特征：
- 到处加 debounce，参数不统一
- 没有熔断机制，错误时继续请求
- 限流策略散落各处`,
    badCode: `// ❌ 典型屎山：到处加 debounce，没有统一策略

// 搜索组件
function SearchBox() {
  const [query, setQuery] = useState('')
  
  // 问题1: debounce 时间写死，不同场景不同需求
  const debouncedSearch = useMemo(
    () => debounce(async (q) => {
      const results = await fetch(\`/api/search?q=\${q}\`)
      setSearchResults(results)
    }, 300),  // 为什么是300？凭感觉
    []
  )
  
  const handleChange = (e) => {
    setQuery(e.target.value)
    debouncedSearch(e.target.value)
  }
  
  return <input onChange={handleChange} />
}

// 列表刷新
function RefreshButton() {
  const [loading, setLoading] = useState(false)
  
  // 问题2: 手动控制 loading，但用户可以疯狂点
  const handleRefresh = async () => {
    if (loading) return  // 简单判断，但不完善
    
    setLoading(true)
    try {
      await fetchList()
    } finally {
      setLoading(false)
    }
  }
  
  return <button onClick={handleRefresh}>刷新</button>
}

// 问题3: 没有熔断，错误后继续请求
// 问题4: 没有优先级，所有请求一视同仁
// 问题5: 没有全局限流，每个组件自己管自己`,
    goodCode: `// ✅ 优雅设计：令牌桶 + 漏桶 + 熔断器

// ==================== 令牌桶算法 ====================
class TokenBucket {
  private tokens: number
  private lastRefill: number
  
  constructor(
    private capacity: number,    // 桶容量
    private refillRate: number,  // 每秒补充的令牌数
    private refillInterval = 1000 // 补充间隔(ms)
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }
  
  // 尝试获取令牌
  tryAcquire(tokens = 1): boolean {
    this.refill()
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }
    return false
  }
  
  // 等待获取令牌（返回等待时间）
  async acquire(tokens = 1): Promise<void> {
    while (!this.tryAcquire(tokens)) {
      const waitTime = this.getTimeToNextToken(tokens)
      await delay(waitTime)
    }
  }
  
  // 补充令牌
  private refill() {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    
    if (elapsed >= this.refillInterval) {
      const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.refillRate
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }
  
  private getTimeToNextToken(needed: number): number {
    const deficit = needed - this.tokens
    if (deficit <= 0) return 0
    return Math.ceil((deficit / this.refillRate) * this.refillInterval)
  }
  
  // 获取当前状态（用于监控）
  getStatus() {
    return {
      available: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate
    }
  }
}

// ==================== 漏桶算法 ====================
class LeakyBucket {
  private queue: Array<() => Promise<any>> = []
  private processing = false
  
  constructor(
    private capacity: number,    // 桶容量
    private leakRate: number     // 每秒处理的请求数
  ) {}
  
  // 添加请求到桶中
  async add<T>(request: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.capacity) {
      throw new Error('Bucket overflow')
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      
      this.process()
    })
  }
  
  // 以固定速率处理请求
  private async process() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    
    while (this.queue.length > 0) {
      const request = this.queue.shift()!
      await request()
      await delay(1000 / this.leakRate)  // 固定间隔
    }
    
    this.processing = false
  }
}

// ==================== 熔断器 ====================
type CircuitState = 'closed' | 'open' | 'half-open'

class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures = 0
  private lastFailureTime = 0
  private successCount = 0
  
  constructor(
    private failureThreshold: number,   // 失败次数阈值
    private recoveryTimeout: number,    // 恢复超时(ms)
    private halfOpenSuccesses: number   // 半开状态成功次数
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 熔断器打开，直接拒绝
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'half-open'
        this.successCount = 0
      } else {
        throw new Error('Circuit breaker is open')
      }
    }
    
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess() {
    this.failures = 0
    
    if (this.state === 'half-open') {
      this.successCount++
      if (this.successCount >= this.halfOpenSuccesses) {
        this.state = 'closed'
      }
    }
  }
  
  private onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open'
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    }
  }
}

// ==================== 限流器管理器 ====================
class RateLimiterManager {
  private buckets = new Map<string, TokenBucket>()
  private circuits = new Map<string, CircuitBreaker>()
  
  // 为某个 API 创建限流器
  configure(apiKey: string, config: {
    tokensPerSecond: number
    burstSize: number
    circuitBreaker?: {
      failureThreshold: number
      recoveryTimeout: number
    }
  }) {
    this.buckets.set(apiKey, new TokenBucket(
      config.burstSize,
      config.tokensPerSecond
    ))
    
    if (config.circuitBreaker) {
      this.circuits.set(apiKey, new CircuitBreaker(
        config.circuitBreaker.failureThreshold,
        config.circuitBreaker.recoveryTimeout,
        3
      ))
    }
  }
  
  // 限流执行请求
  async execute<T>(apiKey: string, request: () => Promise<T>): Promise<T> {
    const bucket = this.buckets.get(apiKey)
    const circuit = this.circuits.get(apiKey)
    
    // 等待令牌
    if (bucket) {
      await bucket.acquire()
    }
    
    // 熔断保护
    if (circuit) {
      return circuit.execute(request)
    }
    
    return request()
  }
  
  // 尝试执行（不等待，失败立即返回）
  tryExecute<T>(apiKey: string, request: () => Promise<T>): Promise<T> | null {
    const bucket = this.buckets.get(apiKey)
    
    if (bucket && !bucket.tryAcquire()) {
      return null  // 限流
    }
    
    return request()
  }
}

// ==================== 全局配置 ====================
const rateLimiter = new RateLimiterManager()

// 配置不同 API 的限流策略
rateLimiter.configure('/api/search', {
  tokensPerSecond: 2,   // 每秒2个请求
  burstSize: 5,         // 允许突发5个
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000
  }
})

rateLimiter.configure('/api/payment', {
  tokensPerSecond: 1,   // 支付接口严格限制
  burstSize: 1,         // 不允许突发
  circuitBreaker: {
    failureThreshold: 3,
    recoveryTimeout: 60000
  }
})

// ==================== React Hook ====================
function useRateLimitedRequest<T>(
  apiKey: string,
  request: () => Promise<T>
) {
  const [state, setState] = useState<{
    loading: boolean
    data: T | null
    error: Error | null
    rateLimited: boolean
  }>({
    loading: false,
    data: null,
    error: null,
    rateLimited: false
  })
  
  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, rateLimited: false }))
    
    try {
      const data = await rateLimiter.execute(apiKey, request)
      setState({ loading: false, data, error: null, rateLimited: false })
    } catch (error) {
      if (error.message === 'Circuit breaker is open') {
        setState(prev => ({ ...prev, loading: false, rateLimited: true }))
      } else {
        setState({ loading: false, data: null, error, rateLimited: false })
      }
    }
  }, [apiKey, request])
  
  return { ...state, execute }
}

// ==================== 使用示例 ====================
function SearchBox() {
  const [query, setQuery] = useState('')
  const { data, loading, execute } = useRateLimitedRequest(
    '/api/search',
    () => fetch(\`/api/search?q=\${query}\`).then(r => r.json())
  )
  
  // 输入时自动限流
  useEffect(() => {
    if (query.length >= 2) {
      execute()
    }
  }, [query])
  
  return <input value={query} onChange={e => setQuery(e.target.value)} />
}

function PaymentButton() {
  const { loading, rateLimited, execute } = useRateLimitedRequest(
    '/api/payment',
    () => processPayment()
  )
  
  return (
    <button 
      onClick={execute} 
      disabled={loading || rateLimited}
    >
      {rateLimited ? '请求过于频繁，请稍后再试' : '支付'}
    </button>
  )
}

// 🎯 核心价值：
// 1. 统一限流策略，全局可控
// 2. 允许合理突发（令牌桶）
// 3. 熔断保护，防止级联失败
// 4. 自动恢复（半开状态）
// 5. 监控友好，状态可观测`,
    designPattern: '令牌桶 + 漏桶 + 熔断器模式'
  },
  {
    id: 'plugin',
    title: '插件系统架构',
    subtitle: '低代码平台/编辑器核心',
    difficulty: 5,
    tags: ['插件架构', '生命周期', '钩子系统'],
    category: '架构模式',
    problem: `插件系统是复杂应用的核心架构：

**需要插件系统的场景：**

1. **编辑器** - VSCode、Figma、Sketch
2. **低代码平台** - 自定义组件、自定义逻辑
3. **CRM/ERP** - 行业定制功能
4. **监控平台** - 自定义数据源、自定义面板
5. **CLI工具** - Webpack、Vite 插件

**核心挑战：**

1. **生命周期管理** - 插件的加载、启用、禁用、卸载
2. **依赖关系** - 插件A依赖插件B
3. **通信机制** - 插件间通信、与宿主通信
4. **隔离性** - 插件崩溃不影响宿主
5. **扩展点** - 哪些能力可以扩展

典型烂代码特征：
- 没有统一接口，每个插件写法不同
- 插件间直接调用，耦合严重
- 没有生命周期管理`,
    badCode: `// ❌ 典型屎山：没有插件架构，功能写死

function Editor() {
  const [content, setContent] = useState('')
  
  // 功能1：自动保存，写死在组件里
  useEffect(() => {
    const timer = setInterval(() => {
      localStorage.setItem('draft', content)
    }, 5000)
    return () => clearInterval(timer)
  }, [content])
  
  // 功能2：字数统计，写死在组件里
  const wordCount = content.length
  
  // 功能3：Markdown 预览，写死在组件里
  const [preview, setPreview] = useState('')
  useEffect(() => {
    setPreview(markdownToHtml(content))
  }, [content])
  
  // 功能4：语法高亮...
  // 功能5：自动补全...
  // 功能6：快捷键...
  // 每加一个功能都要改这个组件，越来越臃肿
  
  return (
    <div>
      <textarea value={content} onChange={e => setContent(e.target.value)} />
      <div>字数: {wordCount}</div>
      <div dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  )
}

// 问题：
// 1. 功能写死，无法动态开关
// 2. 加功能要改核心代码
// 3. 功能间耦合，改一个影响其他
// 4. 无法让第三方扩展
// 5. 性能问题：所有功能都加载`,
    goodCode: `// ✅ 优雅设计：完整的插件架构

// ==================== 插件接口定义 ====================
interface Plugin {
  // 元信息
  id: string
  name: string
  version: string
  dependencies?: string[]  // 依赖的其他插件
  
  // 生命周期钩子
  install?(host: PluginHost): void | Promise<void>
  activate?(context: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
  uninstall?(): void | Promise<void>
  
  // 扩展点注册
  extensions?: {
    [extensionPoint: string]: ExtensionHandler
  }
}

interface ExtensionHandler {
  priority?: number
  handler: (...args: any[]) => any
}

// ==================== 插件上下文 ====================
interface PluginContext {
  // 能力注入
  host: PluginHost
  
  // 状态存储
  state: Map<string, any>
  
  // 事件通信
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  emit(event: string, data: any): void
  
  // 其他插件访问
  getPlugin(id: string): Plugin | null
  
  // 扩展点注册
  registerExtension(point: string, handler: ExtensionHandler): void
  
  // 配置
  config: Record<string, any>
}

// ==================== 插件宿主 ====================
class PluginHost {
  private plugins = new Map<string, Plugin>()
  private contexts = new Map<string, PluginContext>()
  private extensionPoints = new Map<string, ExtensionHandler[]>()
  private eventBus = new EventEmitter()
  private hooks = new Map<string, Set<Function>>()
  
  // 注册扩展点（宿主定义）
  defineExtensionPoint(name: string) {
    this.extensionPoints.set(name, [])
  }
  
  // 触发扩展点（宿主调用）
  async invokeExtension<T>(point: string, ...args: any[]): Promise<T[]> {
    const handlers = this.extensionPoints.get(point) || []
    const results = await Promise.all(
      handlers.map(h => h.handler(...args))
    )
    return results
  }
  
  // 注册插件
  async register(plugin: Plugin) {
    // 检查依赖
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(\`Plugin \${plugin.id} requires \${dep}\`)
        }
      }
    }
    
    this.plugins.set(plugin.id, plugin)
    
    // 创建上下文
    const context: PluginContext = {
      host: this,
      state: new Map(),
      on: this.eventBus.on.bind(this.eventBus),
      off: this.eventBus.off.bind(this.eventBus),
      emit: this.eventBus.emit.bind(this.eventBus),
      getPlugin: (id) => this.plugins.get(id) || null,
      registerExtension: (point, handler) => {
        const handlers = this.extensionPoints.get(point)
        if (handlers) {
          handlers.push(handler)
          handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0))
        }
      },
      config: {}
    }
    
    this.contexts.set(plugin.id, context)
    
    // 注册扩展
    if (plugin.extensions) {
      for (const [point, handler] of Object.entries(plugin.extensions)) {
        context.registerExtension(point, handler)
      }
    }
    
    // 安装
    await plugin.install?.(this)
  }
  
  // 激活插件
  async activate(pluginId: string) {
    const plugin = this.plugins.get(pluginId)
    const context = this.contexts.get(pluginId)
    
    if (plugin && context) {
      await plugin.activate?.(context)
    }
  }
  
  // 停用插件
  async deactivate(pluginId: string) {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      await plugin.deactivate?.()
    }
  }
  
  // 卸载插件
  async uninstall(pluginId: string) {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      await plugin.deactivate?.()
      await plugin.uninstall?.()
      this.plugins.delete(pluginId)
      this.contexts.delete(pluginId)
      
      // 移除扩展
      for (const handlers of this.extensionPoints.values()) {
        const index = handlers.findIndex(h => h.handler === plugin)
        if (index >= 0) handlers.splice(index, 1)
      }
    }
  }
  
  // 钩子系统
  onHook(name: string, handler: Function) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, new Set())
    }
    this.hooks.get(name)!.add(handler)
  }
  
  async emitHook(name: string, ...args: any[]) {
    const handlers = this.hooks.get(name)
    if (handlers) {
      for (const handler of handlers) {
        await handler(...args)
      }
    }
  }
}

// ==================== 具体插件示例 ====================

// 自动保存插件
const autoSavePlugin: Plugin = {
  id: 'auto-save',
  name: 'Auto Save',
  version: '1.0.0',
  
  activate(context) {
    let timer: NodeJS.Timeout
    
    context.on('content:change', (content: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        localStorage.setItem('draft', content)
        context.emit('save:success', { timestamp: Date.now() })
      }, 5000)
    })
    
    context.state.set('timer', timer)
  },
  
  deactivate(context) {
    clearTimeout(context.state.get('timer'))
  }
}

// 字数统计插件
const wordCountPlugin: Plugin = {
  id: 'word-count',
  name: 'Word Count',
  version: '1.0.0',
  
  extensions: {
    'editor:status-bar': {
      handler: ({ content }: { content: string }) => ({
        label: '字数',
        value: content.length
      })
    }
  }
}

// Markdown 预览插件
const markdownPreviewPlugin: Plugin = {
  id: 'markdown-preview',
  name: 'Markdown Preview',
  version: '1.0.0',
  dependencies: ['word-count'],  // 依赖字数统计插件
  
  extensions: {
    'editor:panel': {
      handler: ({ content }: { content: string }) => ({
        id: 'preview',
        title: '预览',
        render: () => <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
      })
    }
  }
}

// 快捷键插件
const shortcutPlugin: Plugin = {
  id: 'shortcut',
  name: 'Shortcut Manager',
  version: '1.0.0',
  
  activate(context) {
    const shortcuts = new Map<string, Function>()
    
    // 注册快捷键的 API
    context.state.set('register', (key: string, handler: Function) => {
      shortcuts.set(key, handler)
    })
    
    // 全局监听
    const handler = (e: KeyboardEvent) => {
      const key = formatKey(e)
      const fn = shortcuts.get(key)
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    
    window.addEventListener('keydown', handler)
    context.state.set('handler', handler)
  },
  
  deactivate(context) {
    window.removeEventListener('keydown', context.state.get('handler'))
  }
}

// ==================== 编辑器实现 ====================
function Editor() {
  const [content, setContent] = useState('')
  const hostRef = useRef<PluginHost>()
  const [statusBarItems, setStatusBarItems] = useState<any[]>([])
  const [panels, setPanels] = useState<any[]>([])
  
  // 初始化插件系统
  useEffect(() => {
    const host = new PluginHost()
    
    // 定义扩展点
    host.defineExtensionPoint('editor:status-bar')
    host.defineExtensionPoint('editor:panel')
    host.defineExtensionPoint('editor:toolbar')
    
    // 注册插件
    host.register(autoSavePlugin)
    host.register(wordCountPlugin)
    host.register(shortcutPlugin)
    host.register(markdownPreviewPlugin)
    
    // 激活所有插件
    host.activate('auto-save')
    host.activate('word-count')
    host.activate('shortcut')
    host.activate('markdown-preview')
    
    hostRef.current = host
    
    return () => {
      // 卸载所有插件
      host.uninstall('auto-save')
      host.uninstall('word-count')
      host.uninstall('shortcut')
      host.uninstall('markdown-preview')
    }
  }, [])
  
  // 内容变化时通知插件
  const handleChange = async (newContent: string) => {
    setContent(newContent)
    
    const host = hostRef.current
    if (host) {
      // 触发事件
      host.emitHook('content:change', newContent)
      
      // 获取扩展点返回的内容
      const items = await host.invokeExtension('editor:status-bar', { content: newContent })
      setStatusBarItems(items)
      
      const panelItems = await host.invokeExtension('editor:panel', { content: newContent })
      setPanels(panelItems)
    }
  }
  
  return (
    <div className="editor">
      <textarea value={content} onChange={e => handleChange(e.target.value)} />
      
      {/* 状态栏 - 插件可扩展 */}
      <div className="status-bar">
        {statusBarItems.map((item, i) => (
          <span key={i}>{item.label}: {item.value}</span>
        ))}
      </div>
      
      {/* 面板区 - 插件可扩展 */}
      <div className="panels">
        {panels.map(panel => (
          <div key={panel.id}>{panel.render()}</div>
        ))}
      </div>
    </div>
  )
}

// ==================== React Hook 封装 ====================
function usePluginHost(initialPlugins: Plugin[]) {
  const hostRef = useRef<PluginHost>()
  const [, forceUpdate] = useState(0)
  
  useEffect(() => {
    const host = new PluginHost()
    host.defineExtensionPoint('editor:status-bar')
    
    initialPlugins.forEach(p => host.register(p))
    initialPlugins.forEach(p => host.activate(p.id))
    
    hostRef.current = host
    forceUpdate(x => x + 1)
    
    return () => {
      initialPlugins.forEach(p => host.uninstall(p.id))
    }
  }, [])
  
  return hostRef.current
}

// 🎯 核心价值：
// 1. 宿主稳定，功能通过插件扩展
// 2. 插件独立开发、测试、部署
// 3. 生命周期完整管理
// 4. 依赖自动解析
// 5. 扩展点灵活定义`,
    designPattern: '插件架构 + 生命周期 + 扩展点模式'
  },
  {
    id: 'state-sync',
    title: '多端状态同步引擎',
    subtitle: '离线优先 + 冲突解决',
    difficulty: 5,
    tags: ['状态同步', '离线优先', 'CRDT'],
    category: '架构模式',
    problem: `多端同步是现代应用的必备能力：

**实际场景：**

1. **笔记应用** - 手机、电脑、平板同步
2. **任务管理** - 离线也能用，联网后同步
3. **协作文档** - 多人实时编辑
4. **购物车** - 手机加商品，电脑能看到
5. **游戏进度** - 多设备同步

**核心挑战：**

1. **离线支持** - 断网时继续使用
2. **冲突解决** - 两台设备同时修改
3. **增量同步** - 只同步变化的部分
4. **版本管理** - 谁先谁后
5. **数据一致性** - 最终一致性保证

典型烂代码特征：
- 只在线使用，离线不可用
- 冲突时覆盖，丢数据
- 全量同步，浪费流量`,
    badCode: `// ❌ 典型屎山：只在线，无冲突处理

function TodoApp() {
  const [todos, setTodos] = useState([])
  
  // 只从服务器获取
  useEffect(() => {
    fetch('/api/todos')
      .then(r => r.json())
      .then(setTodos)
  }, [])
  
  // 直接发送到服务器
  const addTodo = async (text: string) => {
    const response = await fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text })
    })
    const newTodo = await response.json()
    setTodos([...todos, newTodo])
  }
  
  // 问题：
  // 1. 离线时无法使用
  // 2. 网络错误直接丢失操作
  // 3. 多设备同时修改会覆盖
  // 4. 每次都要请求全部数据
  
  return (
    <div>
      {todos.map(todo => <div key={todo.id}>{todo.text}</div>)}
      <button onClick={() => addTodo('New')}>Add</button>
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：离线优先 + 增量同步 + CRDT

// ==================== 同步状态机 ====================
type SyncState = 
  | { status: 'idle' }
  | { status: 'syncing'; pendingCount: number }
  | { status: 'offline'; pendingCount: number }
  | { status: 'error'; error: Error; pendingCount: number }

type SyncEvent = 
  | { type: 'GO_ONLINE' }
  | { type: 'GO_OFFLINE' }
  | { type: 'LOCAL_CHANGE'; change: Change }
  | { type: 'REMOTE_CHANGE'; change: Change }
  | { type: 'SYNC_START'; count: number }
  | { type: 'SYNC_SUCCESS' }
  | { type: 'SYNC_ERROR'; error: Error }

// ==================== 变更记录 ====================
interface Change {
  id: string
  type: 'create' | 'update' | 'delete'
  collection: string
  documentId: string
  data?: any
  timestamp: number
  deviceId: string
  version: number
}

// ==================== 同步引擎 ====================
class SyncEngine<T extends { id: string; version: number }> {
  private localDB: IndexedDBWrapper
  private pendingChanges: Change[] = []
  private syncState: SyncState = { status: 'idle' }
  private listeners = new Set<(state: SyncState) => void>()
  private deviceId: string
  
  constructor(
    private collection: string,
    private remoteAPI: SyncAPI
  ) {
    this.deviceId = this.getDeviceId()
    this.init()
  }
  
  private async init() {
    // 加载本地数据
    await this.loadPendingChanges()
    
    // 监听网络状态
    window.addEventListener('online', () => this.onOnline())
    window.addEventListener('offline', () => this.onOffline())
    
    // 监听远程推送
    this.remoteAPI.subscribe(this.collection, (change) => {
      this.applyRemoteChange(change)
    })
    
    // 初始同步
    if (navigator.onLine) {
      await this.sync()
    }
  }
  
  // 本地变更
  async localChange(change: Omit<Change, 'id' | 'timestamp' | 'deviceId' | 'version'>) {
    const fullChange: Change = {
      ...change,
      id: generateId(),
      timestamp: Date.now(),
      deviceId: this.deviceId,
      version: await this.getNextVersion()
    }
    
    // 1. 立即应用到本地
    await this.applyLocalChange(fullChange)
    
    // 2. 保存到待同步队列
    this.pendingChanges.push(fullChange)
    await this.savePendingChanges()
    
    // 3. 尝试同步
    if (navigator.onLine) {
      this.sync()
    } else {
      this.updateState({ status: 'offline', pendingCount: this.pendingChanges.length })
    }
  }
  
  // 同步到服务器
  private async sync() {
    if (this.pendingChanges.length === 0) return
    
    this.updateState({ status: 'syncing', pendingCount: this.pendingChanges.length })
    
    try {
      // 批量发送变更
      const result = await this.remoteAPI.sync(this.collection, {
        deviceId: this.deviceId,
        changes: this.pendingChanges,
        lastSyncVersion: await this.getLastSyncVersion()
      })
      
      // 处理远程变更
      for (const remoteChange of result.changes) {
        await this.applyRemoteChange(remoteChange)
      }
      
      // 清除已同步的变更
      this.pendingChanges = this.pendingChanges.filter(
        c => !result.syncedIds.includes(c.id)
      )
      await this.savePendingChanges()
      
      // 更新同步版本
      await this.setLastSyncVersion(result.newVersion)
      
      this.updateState({ status: 'idle' })
      
    } catch (error) {
      this.updateState({ status: 'error', error, pendingCount: this.pendingChanges.length })
    }
  }
  
  // 应用远程变更（可能产生冲突）
  private async applyRemoteChange(remoteChange: Change) {
    const local = await this.localDB.get(this.collection, remoteChange.documentId)
    
    if (!local) {
      // 本地不存在，直接应用
      await this.localDB.put(this.collection, remoteChange.data)
      return
    }
    
    // 冲突检测
    if (local.version >= remoteChange.version) {
      // 本地版本更新或相同，需要解决冲突
      const resolved = await this.resolveConflict(local, remoteChange)
      await this.localDB.put(this.collection, resolved)
    } else {
      // 远程版本更新，直接应用
      await this.localDB.put(this.collection, remoteChange.data)
    }
  }
  
  // 冲突解决策略
  private async resolveConflict(local: T, remote: Change): Promise<T> {
    // 策略1: 最后写入胜出
    // return remote.timestamp > local.updatedAt ? remote.data : local
    
    // 策略2: 字段级合并
    // return this.mergeFields(local, remote.data)
    
    // 策略3: CRDT（推荐）
    return this.crdtMerge(local, remote.data)
  }
  
  // CRDT 合并（以 Todo 为例）
  private crdtMerge(local: any, remote: any): any {
    // 使用 Last-Writer-Wins Register
    const merged: any = { ...local }
    
    for (const key of Object.keys(remote)) {
      if (remote[key]?.timestamp > (local[key]?.timestamp || 0)) {
        merged[key] = remote[key]
      }
    }
    
    return merged
  }
  
  private updateState(state: SyncState) {
    this.syncState = state
    this.listeners.forEach(l => l(state))
  }
  
  subscribe(listener: (state: SyncState) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

// ==================== React Hook ====================
function useSyncedCollection<T extends { id: string; version: number }>(
  collection: string
) {
  const [data, setData] = useState<T[]>([])
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' })
  const engineRef = useRef<SyncEngine<T>>()
  
  useEffect(() => {
    const engine = new SyncEngine<T>(collection, {
      sync: async (col, payload) => {
        const response = await fetch(\`/api/\${col}/sync\`, {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        return response.json()
      },
      subscribe: (col, handler) => {
        const ws = new WebSocket(\`wss://api.example.com/\${col}\`)
        ws.onmessage = (e) => handler(JSON.parse(e.data))
        return () => ws.close()
      }
    })
    
    engine.subscribe(setSyncState)
    engineRef.current = engine
    
    return () => engine.destroy()
  }, [collection])
  
  const create = useCallback(async (item: Omit<T, 'id' | 'version'>) => {
    await engineRef.current?.localChange({
      type: 'create',
      collection,
      documentId: generateId(),
      data: item
    })
  }, [collection])
  
  const update = useCallback(async (id: string, data: Partial<T>) => {
    await engineRef.current?.localChange({
      type: 'update',
      collection,
      documentId: id,
      data
    })
  }, [collection])
  
  const remove = useCallback(async (id: string) => {
    await engineRef.current?.localChange({
      type: 'delete',
      collection,
      documentId: id
    })
  }, [collection])
  
  return { data, syncState, create, update, remove }
}

// ==================== 使用示例 ====================
function TodoApp() {
  const { data: todos, syncState, create, update, remove } = useSyncedCollection<Todo>('todos')
  
  return (
    <div>
      {/* 同步状态指示器 */}
      <SyncStatus state={syncState} />
      
      {/* 离线也能用 */}
      {todos.map(todo => (
        <div key={todo.id}>
          <input 
            type="checkbox" 
            checked={todo.done}
            onChange={() => update(todo.id, { done: !todo.done })}
          />
          {todo.text}
          <button onClick={() => remove(todo.id)}>删除</button>
        </div>
      ))}
      
      <button onClick={() => create({ text: 'New Todo', done: false })}>
        添加
      </button>
    </div>
  )
}

function SyncStatus({ state }: { state: SyncState }) {
  const statusText = {
    'idle': '✅ 已同步',
    'syncing': '🔄 同步中...',
    'offline': \`📴 离线 (\${state.pendingCount}条待同步)\`,
    'error': \`❌ 同步失败\`
  }[state.status]
  
  return <span className="sync-status">{statusText}</span>
}

// 🎯 核心价值：
// 1. 离线优先，随时可用
// 2. 自动同步，无需手动
// 3. 冲突解决，不丢数据
// 4. 增量同步，省流量
// 5. 最终一致性保证`,
    designPattern: '离线优先 + CRDT + 增量同步'
  },

  // ==================== 领域场景篇 ====================
  {
    id: 'seckill',
    title: '秒杀系统前端设计',
    subtitle: '高并发场景下的前端策略',
    difficulty: 5,
    tags: ['倒计时同步', '请求队列', '预热'],
    category: '电商领域',
    problem: `秒杀是电商最具挑战的场景之一：

**前端核心挑战：**

1. **时间同步** - 用户时间和服务器时间有差异
2. **瞬时高并发** - 0点一瞬间几十万请求
3. **库存预热** - 提前加载商品信息
4. **防刷机制** - 验证码、token
5. **降级策略** - 服务不可用时的处理

**常见坑：**

1. 倒计时不准 - 用户改系统时间就乱了
2. 按钮点太早 - 还没开始就发了请求
3. 网络慢 - 请求排队，用户体验差
4. 刷新页面 - 丢失排队位置`,
    badCode: `// ❌ 典型屎山秒杀页面

function SeckillPage() {
  const [countdown, setCountdown] = useState(0)
  const [canBuy, setCanBuy] = useState(false)
  
  // 问题1: 用本地时间，用户可以改系统时间
  useEffect(() => {
    const targetTime = new Date('2024-01-01 00:00:00').getTime()
    const timer = setInterval(() => {
      const now = Date.now()  // 本地时间，不可信
      const diff = targetTime - now
      setCountdown(Math.max(0, Math.floor(diff / 1000)))
      if (diff <= 0) {
        setCanBuy(true)
        clearInterval(timer)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  
  // 问题2: 直接发请求，没有排队、没有防刷
  const handleBuy = async () => {
    const result = await fetch('/api/seckill/buy', {
      method: 'POST',
      body: JSON.stringify({ productId: '123' })
    })
    if (result.ok) {
      alert('抢购成功！')
    } else {
      alert('抢购失败')
    }
  }
  
  return (
    <div>
      <div>倒计时: {countdown}秒</div>
      <button onClick={handleBuy} disabled={!canBuy}>
        {canBuy ? '立即抢购' : '未开始'}
      </button>
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：完整的秒杀前端方案

// ==================== 时间同步服务 ====================
class TimeSyncService {
  private serverTimeOffset = 0  // 服务器时间 - 本地时间
  private syncInterval = 60000  // 每分钟同步一次
  
  async init() {
    await this.sync()
    setInterval(() => this.sync(), this.syncInterval)
  }
  
  private async sync() {
    const localBefore = Date.now()
    const response = await fetch('/api/time', { 
      headers: { 'Cache-Control': 'no-cache' }
    })
    const localAfter = Date.now()
    
    const serverTime = await response.json().then(r => r.timestamp)
    
    // 计算网络延迟，取中间值
    const latency = (localAfter - localBefore) / 2
    const estimatedServerTime = serverTime + latency
    
    this.serverTimeOffset = estimatedServerTime - localBefore
  }
  
  // 获取服务器时间
  getServerTime(): number {
    return Date.now() + this.serverTimeOffset
  }
}

// ==================== 秒杀状态机 ====================
type SeckillState = 
  | { status: 'before'; startTime: number }
  | { status: 'countdown'; remaining: number }
  | { status: 'ready' }
  | { status: 'processing'; queuePosition: number }
  | { status: 'success'; orderId: string }
  | { status: 'failed'; reason: string }
  | { status: 'soldout' }

// ==================== 秒杀引擎 ====================
class SeckillEngine {
  private timeSync: TimeSyncService
  private token: string | null = null
  private state: SeckillState
  private listeners = new Set<(state: SeckillState) => void>()
  
  constructor(
    private productId: string,
    private startTime: number
  ) {
    this.timeSync = new TimeSyncService()
    this.state = { status: 'before', startTime }
  }
  
  async init() {
    // 1. 同步时间
    await this.timeSync.init()
    
    // 2. 预加载商品信息
    await this.preloadProductInfo()
    
    // 3. 获取秒杀token（防刷）
    this.token = await this.getSeckillToken()
    
    // 4. 开始倒计时
    this.startCountdown()
  }
  
  private startCountdown() {
    const check = () => {
      const serverTime = this.timeSync.getServerTime()
      const remaining = this.startTime - serverTime
      
      if (remaining > 0) {
        if (remaining <= 60000) {  // 最后1分钟
          this.updateState({ status: 'countdown', remaining: Math.ceil(remaining / 1000) })
        } else {
          this.updateState({ status: 'before', startTime: this.startTime })
        }
        requestAnimationFrame(check)
      } else {
        this.updateState({ status: 'ready' })
      }
    }
    
    requestAnimationFrame(check)
  }
  
  // 预加载
  private async preloadProductInfo() {
    // 提前加载商品详情、库存信息
    const response = await fetch(\`/api/seckill/preload/\${this.productId}\`)
    // 缓存到本地
  }
  
  // 获取秒杀token
  private async getSeckillToken(): Promise<string> {
    const response = await fetch(\`/api/seckill/token/\${this.productId}\`)
    const { token } = await response.json()
    return token
  }
  
  // 执行秒杀
  async seckill() {
    if (this.state.status !== 'ready') return
    
    this.updateState({ status: 'processing', queuePosition: 0 })
    
    try {
      // 1. 进入排队
      const queueResult = await this.enterQueue()
      this.updateState({ status: 'processing', queuePosition: queueResult.position })
      
      // 2. 轮询排队状态
      const result = await this.pollQueueStatus(queueResult.ticketId)
      
      if (result.status === 'success') {
        this.updateState({ status: 'success', orderId: result.orderId })
      } else if (result.status === 'soldout') {
        this.updateState({ status: 'soldout' })
      } else {
        this.updateState({ status: 'failed', reason: result.message })
      }
      
    } catch (error) {
      this.updateState({ status: 'failed', reason: error.message })
    }
  }
  
  private async enterQueue() {
    const response = await fetch('/api/seckill/queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Seckill-Token': this.token!
      },
      body: JSON.stringify({
        productId: this.productId,
        timestamp: this.timeSync.getServerTime()
      })
    })
    return response.json()
  }
  
  private async pollQueueStatus(ticketId: string) {
    while (true) {
      const response = await fetch(\`/api/seckill/status/\${ticketId}\`)
      const result = await response.json()
      
      if (result.status !== 'waiting') {
        return result
      }
      
      this.updateState({ 
        status: 'processing', 
        queuePosition: result.position 
      })
      
      await delay(1000)  // 1秒轮询一次
    }
  }
  
  private updateState(state: SeckillState) {
    this.state = state
    this.listeners.forEach(l => l(state))
  }
  
  subscribe(listener: (state: SeckillState) => void) {
    this.listeners.add(listener)
    listener(this.state)  // 立即通知当前状态
    return () => this.listeners.delete(listener)
  }
}

// ==================== React Hook ====================
function useSeckill(productId: string, startTime: number) {
  const [state, setState] = useState<SeckillState>({ status: 'before', startTime })
  const engineRef = useRef<SeckillEngine>()
  
  useEffect(() => {
    const engine = new SeckillEngine(productId, startTime)
    engine.init()
    engine.subscribe(setState)
    engineRef.current = engine
    
    return () => engine.destroy()
  }, [productId, startTime])
  
  const seckill = useCallback(() => {
    engineRef.current?.seckill()
  }, [])
  
  return { state, seckill }
}

// ==================== 组件实现 ====================
function SeckillPage({ productId, startTime }: { productId: string; startTime: number }) {
  const { state, seckill } = useSeckill(productId, startTime)
  
  return (
    <div className="seckill-page">
      {/* 状态渲染 */}
      {state.status === 'before' && (
        <div className="countdown">
          活动即将开始
        </div>
      )}
      
      {state.status === 'countdown' && (
        <div className="countdown imminent">
          <span>{Math.floor(state.remaining / 60)}</span>:
          <span>{state.remaining % 60}</span>
        </div>
      )}
      
      {state.status === 'ready' && (
        <button className="seckill-btn ready" onClick={seckill}>
          立即抢购
        </button>
      )}
      
      {state.status === 'processing' && (
        <div className="processing">
          <div className="spinner" />
          <div>排队中，前方还有 {state.queuePosition} 人</div>
        </div>
      )}
      
      {state.status === 'success' && (
        <div className="result success">
          🎉 恭喜！抢购成功
          <a href={\`/order/\${state.orderId}\`}>查看订单</a>
        </div>
      )}
      
      {state.status === 'failed' && (
        <div className="result failed">
          😢 {state.reason}
        </div>
      )}
      
      {state.status === 'soldout' && (
        <div className="result soldout">
          商品已售罄
        </div>
      )}
    </div>
  )
}

// 🎯 核心价值：
// 1. 服务器时间同步，倒计时准确
// 2. Token 防刷，保护后端
// 3. 排队机制，平滑流量
// 4. 状态清晰，用户可感知
// 5. 预加载，减少最后时刻请求`,
    designPattern: '时间同步 + 排队系统 + 状态机'
  },
  {
    id: 'price-engine',
    title: '价格计算引擎',
    subtitle: '复杂优惠规则处理',
    difficulty: 5,
    tags: ['规则引擎', '策略模式', '责任链'],
    category: '电商领域',
    problem: `价格计算是电商最复杂的业务逻辑：

**实际场景：**

1. **优惠券叠加** - 满减、折扣、无门槛
2. **会员折扣** - 普通会员、黄金会员、钻石会员
3. **活动价格** - 秒杀价、拼团价、限时特价
4. **区域定价** - 不同地区不同价格
5. **组合优惠** - 买A送B、第二件半价

**核心挑战：**

1. **规则冲突** - 多个优惠能否同时用？
2. **计算顺序** - 先打折还是先满减？
3. **精度问题** - 0.1 + 0.2 ≠ 0.3
4. **性能要求** - 购物车几百件商品
5. **可配置** - 运营要能随时改规则`,
    badCode: `// ❌ 典型屎山价格计算

function calculatePrice(items, coupons, user) {
  let total = 0
  
  // 计算商品总价
  items.forEach(item => {
    total += item.price * item.quantity
  })
  
  // 乱七八糟的 if-else
  if (coupons.type === 'discount') {
    total = total * (1 - coupons.value / 100)
  } else if (coupons.type === 'reduce') {
    if (total >= coupons.threshold) {
      total = total - coupons.value
    }
  }
  
  // 会员折扣
  if (user.level === 'gold') {
    total = total * 0.95
  } else if (user.level === 'diamond') {
    total = total * 0.9
  }
  
  // 问题：
  // 1. 规则写死，运营改不了
  // 2. 叠加顺序混乱
  // 3. 精度问题
  // 4. 没法单元测试
  
  return Math.round(total * 100) / 100
}`,
    goodCode: `// ✅ 优雅设计：规则引擎 + 策略模式

// ==================== 价格类型 ====================
type Money = number  // 以分为单位，避免精度问题

interface PriceContext {
  items: CartItem[]
  user: User
  coupons: Coupon[]
  promotions: Promotion[]
  region: string
  timestamp: number
}

interface PriceResult {
  originalPrice: Money
  finalPrice: Money
  discounts: DiscountDetail[]
}

interface DiscountDetail {
  type: string
  name: string
  amount: Money
  rule: string
}

// ==================== 规则引擎 ====================
class PriceEngine {
  private rules: PriceRule[] = []
  
  register(rule: PriceRule) {
    this.rules.push(rule)
    this.rules.sort((a, b) => a.priority - b.priority)
    return this
  }
  
  calculate(ctx: PriceContext): PriceResult {
    const result: PriceResult = {
      originalPrice: this.sumOriginal(ctx.items),
      finalPrice: 0,
      discounts: []
    }
    
    let currentPrice = result.originalPrice
    
    for (const rule of this.rules) {
      if (rule.isApplicable(ctx, currentPrice)) {
        const discount = rule.apply(ctx, currentPrice)
        if (discount.amount > 0) {
          currentPrice -= discount.amount
          result.discounts.push(discount)
        }
      }
    }
    
    result.finalPrice = Math.max(0, currentPrice)
    return result
  }
  
  private sumOriginal(items: CartItem[]): Money {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}

// ==================== 规则接口 ====================
interface PriceRule {
  name: string
  priority: number  // 越小越先执行
  isApplicable(ctx: PriceContext, currentPrice: Money): boolean
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail
}

// ==================== 具体规则实现 ====================

// 秒杀价格规则
class SeckillPriceRule implements PriceRule {
  name = '秒杀价'
  priority = 10  // 最先执行
  
  isApplicable(ctx: PriceContext) {
    return ctx.items.some(item => item.seckillPrice && this.isSeckillTime(ctx.timestamp))
  }
  
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    let discount = 0
    
    for (const item of ctx.items) {
      if (item.seckillPrice && this.isSeckillTime(ctx.timestamp)) {
        discount += (item.price - item.seckillPrice) * item.quantity
      }
    }
    
    return {
      type: 'seckill',
      name: '秒杀价',
      amount: discount,
      rule: '秒杀商品特价'
    }
  }
  
  private isSeckillTime(timestamp: number): boolean {
    // 判断是否在秒杀时间内
    return true
  }
}

// 会员折扣规则
class MemberDiscountRule implements PriceRule {
  name = '会员折扣'
  priority = 50
  
  private discounts: Record<string, number> = {
    'normal': 1,
    'silver': 0.98,
    'gold': 0.95,
    'diamond': 0.9
  }
  
  isApplicable(ctx: PriceContext) {
    return ctx.user.level in this.discounts
  }
  
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    const rate = this.discounts[ctx.user.level]
    const discount = Math.floor(currentPrice * (1 - rate))
    
    return {
      type: 'member',
      name: \`\${ctx.user.level}会员折扣\`,
      amount: discount,
      rule: \`\${(1 - rate) * 100}%折扣\`
    }
  }
}

// 满减规则
class FullReductionRule implements PriceRule {
  name = '满减'
  priority = 60
  
  constructor(private config: { threshold: Money; reduce: Money }[]) {}
  
  isApplicable(ctx: PriceContext, currentPrice: Money) {
    return this.config.some(c => currentPrice >= c.threshold)
  }
  
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    // 找到适用的最大满减
    const applicable = this.config
      .filter(c => currentPrice >= c.threshold)
      .sort((a, b) => b.threshold - a.threshold)[0]
    
    return {
      type: 'full-reduction',
      name: '满减优惠',
      amount: applicable.reduce,
      rule: \`满\${applicable.threshold / 100}减\${applicable.reduce / 100}\`
    }
  }
}

// 优惠券规则
class CouponRule implements PriceRule {
  name = '优惠券'
  priority = 70
  
  isApplicable(ctx: PriceContext) {
    return ctx.coupons.length > 0
  }
  
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    // 选择最优优惠券
    const bestCoupon = this.selectBestCoupon(ctx.coupons, currentPrice)
    
    if (!bestCoupon) {
      return { type: 'coupon', name: '', amount: 0, rule: '' }
    }
    
    let discount = 0
    
    switch (bestCoupon.type) {
      case 'reduce':
        if (currentPrice >= bestCoupon.threshold) {
          discount = bestCoupon.value
        }
        break
      case 'discount':
        discount = Math.floor(currentPrice * (1 - bestCoupon.value / 10))
        break
      case 'none':
        discount = bestCoupon.value
        break
    }
    
    return {
      type: 'coupon',
      name: bestCoupon.name,
      amount: discount,
      rule: bestCoupon.type === 'discount' 
        ? \`\${bestCoupon.value}折\` 
        : \`减免\${bestCoupon.value / 100}元\`
    }
  }
  
  private selectBestCoupon(coupons: Coupon[], price: Money): Coupon | null {
    return coupons
      .filter(c => this.canUse(c, price))
      .map(c => ({ coupon: c, value: this.calculateValue(c, price) }))
      .sort((a, b) => b.value - a.value)[0]?.coupon || null
  }
  
  private canUse(coupon: Coupon, price: Money): boolean {
    if (coupon.type === 'reduce') {
      return price >= coupon.threshold
    }
    return true
  }
  
  private calculateValue(coupon: Coupon, price: Money): Money {
    if (coupon.type === 'discount') {
      return Math.floor(price * (1 - coupon.value / 10))
    }
    return coupon.value
  }
}

// ==================== 组装引擎 ====================
const priceEngine = new PriceEngine()
  .register(new SeckillPriceRule())      // 优先秒杀价
  .register(new MemberDiscountRule())    // 会员折扣
  .register(new FullReductionRule([      // 满减
    { threshold: 10000, reduce: 500 },
    { threshold: 20000, reduce: 1500 },
    { threshold: 50000, reduce: 5000 }
  ]))
  .register(new CouponRule())            // 优惠券

// ==================== React Hook ====================
function usePriceCalculator() {
  const calculate = useCallback((ctx: PriceContext): PriceResult => {
    return priceEngine.calculate(ctx)
  }, [])
  
  return { calculate }
}

// ==================== 组件使用 ====================
function CartSummary() {
  const { items, user, coupons } = useCart()
  const { calculate } = usePriceCalculator()
  
  const result = useMemo(() => calculate({
    items,
    user,
    coupons,
    promotions: [],
    region: 'CN',
    timestamp: Date.now()
  }), [items, user, coupons, calculate])
  
  return (
    <div className="cart-summary">
      <div className="original-price">
        商品总额: ¥{(result.originalPrice / 100).toFixed(2)}
      </div>
      
      {result.discounts.map((discount, i) => (
        <div key={i} className="discount-item">
          <span>{discount.name}</span>
          <span>-¥{(discount.amount / 100).toFixed(2)}</span>
        </div>
      ))}
      
      <div className="final-price">
        应付: ¥{(result.finalPrice / 100).toFixed(2)}
      </div>
    </div>
  )
}

// ==================== 规则配置化（可从后端加载） ====================
const ruleConfigs = [
  { type: 'seckill', priority: 10 },
  { type: 'member', priority: 50, config: { gold: 0.95, diamond: 0.9 } },
  { type: 'full-reduction', priority: 60, config: [
    { threshold: 10000, reduce: 500 }
  ]},
  { type: 'coupon', priority: 70 }
]

// 动态创建引擎
function createEngineFromConfig(configs: any[]) {
  const engine = new PriceEngine()
  
  for (const config of configs) {
    switch (config.type) {
      case 'seckill':
        engine.register(new SeckillPriceRule())
        break
      case 'member':
        engine.register(new MemberDiscountRule())
        break
      // ...
    }
  }
  
  return engine
}

// 🎯 核心价值：
// 1. 规则可配置，运营可调整
// 2. 执行顺序明确
// 3. 精度正确（分为单位）
// 4. 易于扩展新规则
// 5. 每个规则可独立测试`,
    designPattern: '规则引擎 + 策略模式 + 责任链'
  },
  {
    id: 'realtime-data',
    title: '实时数据流处理',
    subtitle: 'WebSocket/行情/监控',
    difficulty: 5,
    tags: ['WebSocket', '心跳检测', '增量更新'],
    category: '金融领域',
    problem: `实时数据是金融/监控场景的核心：

**实际场景：**

1. **股票行情** - 每秒几百条价格更新
2. **数字货币** - 24小时不间断
3. **监控大屏** - 多个数据源同时推送
4. **即时通讯** - 消息实时送达
5. **协作编辑** - 多人实时同步

**核心挑战：**

1. **断线重连** - 网络不稳定时自动恢复
2. **心跳检测** - 检测连接是否存活
3. **数据增量** - 只推送变化的部分
4. **消息顺序** - 保证消息不乱序
5. **背压处理** - 数据太快消费不过来`,
    badCode: `// ❌ 典型屎山 WebSocket

function StockPage() {
  const [prices, setPrices] = useState({})
  
  useEffect(() => {
    const ws = new WebSocket('wss://api.example.com/stock')
    
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      // 直接更新，没有考虑性能
      setPrices(prev => ({ ...prev, [data.symbol]: data.price }))
    }
    
    // 没有心跳，不知道连接是否存活
    // 没有断线重连
    // 没有错误处理
    
    return () => ws.close()
  }, [])
  
  return (
    <div>
      {Object.entries(prices).map(([symbol, price]) => (
        <div key={symbol}>{symbol}: {price}</div>
      ))}
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：完整的实时数据流方案

// ==================== WebSocket 管理器 ====================
class WebSocketManager {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private heartbeatInterval: NodeJS.Timeout | null = null
  private heartbeatTimeout: NodeJS.Timeout | null = null
  private messageQueue: any[] = []  // 断线时缓存消息
  private listeners = new Map<string, Set<Function>>()
  private status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' = 'disconnected'
  
  constructor(url: string) {
    this.url = url
  }
  
  connect() {
    if (this.ws) return
    
    this.status = 'connecting'
    this.ws = new WebSocket(this.url)
    
    this.ws.onopen = () => {
      this.status = 'connected'
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.flushMessageQueue()
      this.emit('connected', {})
    }
    
    this.ws.onmessage = (e) => {
      const message = JSON.parse(e.data)
      
      // 处理心跳响应
      if (message.type === 'pong') {
        this.resetHeartbeatTimeout()
        return
      }
      
      // 分发消息
      this.emit(message.type, message.data)
      this.emit('message', message)
    }
    
    this.ws.onclose = (e) => {
      this.status = 'disconnected'
      this.stopHeartbeat()
      this.ws = null
      
      // 非主动关闭，尝试重连
      if (e.code !== 1000) {
        this.scheduleReconnect()
      }
      
      this.emit('disconnected', { code: e.code, reason: e.reason })
    }
    
    this.ws.onerror = (error) => {
      this.emit('error', error)
    }
  }
  
  disconnect() {
    this.status = 'disconnecting'
    this.stopHeartbeat()
    this.ws?.close(1000, 'Client disconnect')
    this.ws = null
  }
  
  // 发送消息
  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      // 断线时缓存
      this.messageQueue.push(message)
    }
  }
  
  // 订阅
  subscribe<T>(event: string, handler: (data: T) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }
  
  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(handler => handler(data))
  }
  
  // 心跳机制
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
        this.startHeartbeatTimeout()
      }
    }, 30000)  // 30秒心跳
  }
  
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }
  
  private startHeartbeatTimeout() {
    this.heartbeatTimeout = setTimeout(() => {
      // 心跳超时，重连
      this.ws?.close()
      this.scheduleReconnect()
    }, 10000)  // 10秒超时
  }
  
  private resetHeartbeatTimeout() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }
  
  // 重连机制
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', {})
      return
    }
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++
    
    setTimeout(() => {
      this.emit('reconnecting', { attempt: this.reconnectAttempts })
      this.connect()
    }, delay)
  }
  
  private flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()!
      this.ws.send(JSON.stringify(message))
    }
  }
}

// ==================== 数据流处理 ====================
class DataStreamProcessor<T> {
  private buffer: T[] = []
  private flushInterval = 100  // 每100ms批量更新
  private maxBatchSize = 100   // 每批最多100条
  private handler: (items: T[]) => void
  private timer: NodeJS.Timeout | null = null
  
  constructor(handler: (items: T[]) => void) {
    this.handler = handler
  }
  
  push(item: T) {
    this.buffer.push(item)
    
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval)
    }
  }
  
  private flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    
    if (this.buffer.length > 0) {
      const items = this.buffer
      this.buffer = []
      this.handler(items)
    }
  }
}

// ==================== 增量更新 ====================
class IncrementalUpdater {
  private state: Map<string, any> = new Map()
  
  // 应用增量更新
  apply(updates: Array<{ id: string; changes: Partial<any> }>) {
    for (const update of updates) {
      const current = this.state.get(update.id) || {}
      this.state.set(update.id, { ...current, ...update.changes })
    }
    return this.getState()
  }
  
  getState() {
    return Object.fromEntries(this.state)
  }
  
  // 计算 diff
  static diff(oldState: Record<string, any>, newState: Record<string, any>) {
    const changes: Array<{ id: string; changes: any }> = []
    
    for (const [id, newValue] of Object.entries(newState)) {
      const oldValue = oldState[id]
      if (!oldValue || !this.deepEqual(oldValue, newValue)) {
        changes.push({ id, changes: newValue })
      }
    }
    
    return changes
  }
  
  private static deepEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }
}

// ==================== React Hook ====================
function useWebSocket<T = any>(url: string) {
  const managerRef = useRef<WebSocketManager>()
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [lastMessage, setLastMessage] = useState<T | null>(null)
  
  useEffect(() => {
    const manager = new WebSocketManager(url)
    managerRef.current = manager
    
    manager.subscribe('connected', () => setStatus('connected'))
    manager.subscribe('disconnected', () => setStatus('disconnected'))
    manager.subscribe('message', (msg: T) => setLastMessage(msg))
    
    manager.connect()
    
    return () => manager.disconnect()
  }, [url])
  
  const send = useCallback((message: any) => {
    managerRef.current?.send(message)
  }, [])
  
  const subscribe = useCallback((event: string, handler: Function) => {
    return managerRef.current?.subscribe(event, handler)
  }, [])
  
  return { status, lastMessage, send, subscribe }
}

// ==================== 股票行情组件 ====================
function StockQuotes({ symbols }: { symbols: string[] }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const processorRef = useRef<DataStreamProcessor<QuoteUpdate>>()
  
  // 批量更新处理
  useEffect(() => {
    processorRef.current = new DataStreamProcessor((updates) => {
      setQuotes(prev => {
        const next = { ...prev }
        for (const update of updates) {
          next[update.symbol] = { ...next[update.symbol], ...update.data }
        }
        return next
      })
    })
  }, [])
  
  const { status, subscribe } = useWebSocket('wss://api.example.com/stock')
  
  useEffect(() => {
    if (status !== 'connected') return
    
    // 订阅行情
    const unsubscribes = symbols.map(symbol => 
      subscribe('quote', (data: QuoteUpdate) => {
        if (data.symbol === symbol) {
          processorRef.current?.push(data)
        }
      })
    )
    
    return () => unsubscribes.forEach(unsub => unsub?.())
  }, [status, symbols, subscribe])
  
  return (
    <div>
      <div className="status">
        {status === 'connected' ? '🟢 已连接' : '🔴 断开'}
      </div>
      
      {symbols.map(symbol => {
        const quote = quotes[symbol]
        if (!quote) return null
        
        return (
          <div key={symbol} className="quote">
            <span className="symbol">{symbol}</span>
            <span className={quote.change >= 0 ? 'up' : 'down'}>
              {quote.price.toFixed(2)}
              <small>{quote.change >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// 🎯 核心价值：
// 1. 自动断线重连
// 2. 心跳检测存活
// 3. 批量更新优化性能
// 4. 增量更新减少传输
// 5. 消息队列保证不丢`,
    designPattern: '心跳检测 + 断线重连 + 批量更新'
  },
  {
    id: 'transaction',
    title: '交易流程编排',
    subtitle: '多步骤验证与状态机',
    difficulty: 5,
    tags: ['交易状态机', '幂等性', '分布式锁'],
    category: '金融领域',
    problem: `交易是金融系统最核心的功能：

**实际场景：**

1. **支付流程** - 创建订单 → 锁库存 → 扣款 → 通知
2. **转账流程** - 验证身份 → 风控 → 冻结 → 转账 → 到账
3. **退款流程** - 验证订单 → 退款申请 → 审核 → 退款
4. **提现流程** - 验证身份 → 风控 → 审批 → 打款

**核心挑战：**

1. **原子性** - 要么全部成功，要么全部失败
2. **幂等性** - 重复请求不重复执行
3. **超时处理** - 支付超时怎么办
4. **状态追踪** - 用户能看到进度
5. **回滚机制** - 失败后如何恢复`,
    badCode: `// ❌ 典型屎山支付流程

async function pay(orderId: string) {
  // 问题1: 没有幂等性，重复点击会重复扣款
  const order = await fetchOrder(orderId)
  
  // 问题2: 这些操作不是原子的
  await lockInventory(order.items)
  await deductBalance(order.userId, order.amount)
  await updateOrderStatus(orderId, 'paid')
  await sendNotification(order.userId)
  
  // 问题3: 任何一步失败，没有回滚
  // 问题4: 超时没处理
  // 问题5: 状态无法追踪
}`,
    goodCode: `// ✅ 优雅设计：交易编排引擎

// ==================== 交易状态机 ====================
type TransactionState = 
  | 'INIT'
  | 'VALIDATING'
  | 'RISK_CHECKING'
  | 'LOCKING'
  | 'DEDUCTING'
  | 'CONFIRMING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'

type TransactionEvent = 
  | { type: 'START' }
  | { type: 'VALIDATE_SUCCESS' }
  | { type: 'VALIDATE_FAILED'; reason: string }
  | { type: 'RISK_PASS' }
  | { type: 'RISK_REJECT'; reason: string }
  | { type: 'LOCK_SUCCESS' }
  | { type: 'LOCK_FAILED'; reason: string }
  | { type: 'DEDUCT_SUCCESS' }
  | { type: 'DEDUCT_FAILED'; reason: string }
  | { type: 'CONFIRM_SUCCESS' }
  | { type: 'TIMEOUT' }
  | { type: 'ROLLBACK_COMPLETE' }

// ==================== 交易上下文 ====================
interface TransactionContext {
  transactionId: string
  orderId: string
  userId: string
  amount: number
  state: TransactionState
  previousState?: TransactionState
  createdAt: number
  updatedAt: number
  steps: StepRecord[]
  error?: string
  idempotencyKey: string
}

interface StepRecord {
  step: string
  status: 'pending' | 'success' | 'failed'
  startedAt: number
  completedAt?: number
  error?: string
  compensation?: () => Promise<void>
}

// ==================== 交易编排器 ====================
class TransactionOrchestrator {
  private stateMachine: StateMachine<TransactionState, TransactionEvent>
  private lockManager: DistributedLockManager
  private transactionRepo: TransactionRepository
  
  constructor() {
    this.stateMachine = this.createStateMachine()
  }
  
  private createStateMachine() {
    return new StateMachine<TransactionState, TransactionEvent>({
      initial: 'INIT',
      states: {
        'INIT': {
          on: {
            'START': { target: 'VALIDATING', action: this.validate }
          }
        },
        'VALIDATING': {
          on: {
            'VALIDATE_SUCCESS': { target: 'RISK_CHECKING', action: this.riskCheck },
            'VALIDATE_FAILED': { target: 'FAILED' }
          }
        },
        'RISK_CHECKING': {
          on: {
            'RISK_PASS': { target: 'LOCKING', action: this.lockResources },
            'RISK_REJECT': { target: 'FAILED' }
          }
        },
        'LOCKING': {
          on: {
            'LOCK_SUCCESS': { target: 'DEDUCTING', action: this.deduct },
            'LOCK_FAILED': { target: 'FAILED' }
          }
        },
        'DEDUCTING': {
          on: {
            'DEDUCT_SUCCESS': { target: 'CONFIRMING', action: this.confirm },
            'DEDUCT_FAILED': { target: 'ROLLING_BACK', action: this.rollback }
          }
        },
        'CONFIRMING': {
          on: {
            'CONFIRM_SUCCESS': { target: 'SUCCESS' },
            'TIMEOUT': { target: 'ROLLING_BACK', action: this.rollback }
          }
        },
        'ROLLING_BACK': {
          on: {
            'ROLLBACK_COMPLETE': { target: 'ROLLED_BACK' }
          }
        },
        'SUCCESS': { type: 'final' },
        'FAILED': { type: 'final' },
        'ROLLED_BACK': { type: 'final' }
      }
    })
  }
  
  // 执行交易（幂等）
  async execute(params: TransactionParams): Promise<TransactionResult> {
    const idempotencyKey = params.idempotencyKey || generateId()
    
    // 1. 幂等检查
    const existing = await this.transactionRepo.findByIdempotencyKey(idempotencyKey)
    if (existing) {
      return this.handleExistingTransaction(existing)
    }
    
    // 2. 分布式锁
    const lock = await this.lockManager.acquire(\`tx:\${params.userId}\`, 30000)
    
    try {
      // 3. 创建交易记录
      const ctx = await this.createTransaction(params, idempotencyKey)
      
      // 4. 执行状态机
      await this.stateMachine.start(ctx)
      
      return {
        transactionId: ctx.transactionId,
        status: ctx.state,
        success: ctx.state === 'SUCCESS'
      }
      
    } finally {
      await lock.release()
    }
  }
  
  // 步骤实现
  private async validate(ctx: TransactionContext) {
    this.recordStep(ctx, 'validate', 'pending')
    
    try {
      const order = await this.orderRepo.findById(ctx.orderId)
      
      if (!order) {
        throw new Error('订单不存在')
      }
      
      if (order.status !== 'pending') {
        throw new Error('订单状态不正确')
      }
      
      if (order.expiredAt < Date.now()) {
        throw new Error('订单已过期')
      }
      
      this.recordStep(ctx, 'validate', 'success')
      this.stateMachine.send({ type: 'VALIDATE_SUCCESS' })
      
    } catch (error) {
      this.recordStep(ctx, 'validate', 'failed', error.message)
      this.stateMachine.send({ type: 'VALIDATE_FAILED', reason: error.message })
    }
  }
  
  private async riskCheck(ctx: TransactionContext) {
    this.recordStep(ctx, 'riskCheck', 'pending')
    
    try {
      const result = await this.riskService.check({
        userId: ctx.userId,
        amount: ctx.amount,
        type: 'payment'
      })
      
      if (result.pass) {
        this.recordStep(ctx, 'riskCheck', 'success')
        this.stateMachine.send({ type: 'RISK_PASS' })
      } else {
        this.recordStep(ctx, 'riskCheck', 'failed', result.reason)
        this.stateMachine.send({ type: 'RISK_REJECT', reason: result.reason })
      }
      
    } catch (error) {
      this.recordStep(ctx, 'riskCheck', 'failed', error.message)
      this.stateMachine.send({ type: 'RISK_REJECT', reason: error.message })
    }
  }
  
  private async lockResources(ctx: TransactionContext) {
    this.recordStep(ctx, 'lockResources', 'pending')
    
    try {
      const order = await this.orderRepo.findById(ctx.orderId)
      
      // 锁定库存
      for (const item of order.items) {
        await this.inventoryService.lock(item.skuId, item.quantity, ctx.transactionId)
      }
      
      // 记录补偿操作
      this.recordStep(ctx, 'lockResources', 'success', undefined, async () => {
        for (const item of order.items) {
          await this.inventoryService.unlock(item.skuId, ctx.transactionId)
        }
      })
      
      this.stateMachine.send({ type: 'LOCK_SUCCESS' })
      
    } catch (error) {
      this.recordStep(ctx, 'lockResources', 'failed', error.message)
      this.stateMachine.send({ type: 'LOCK_FAILED', reason: error.message })
    }
  }
  
  private async deduct(ctx: TransactionContext) {
    this.recordStep(ctx, 'deduct', 'pending')
    
    try {
      await this.paymentService.deduct({
        userId: ctx.userId,
        amount: ctx.amount,
        transactionId: ctx.transactionId
      })
      
      // 记录补偿操作
      this.recordStep(ctx, 'deduct', 'success', undefined, async () => {
        await this.paymentService.refund({
          userId: ctx.userId,
          amount: ctx.amount,
          transactionId: ctx.transactionId
        })
      })
      
      this.stateMachine.send({ type: 'DEDUCT_SUCCESS' })
      
    } catch (error) {
      this.recordStep(ctx, 'deduct', 'failed', error.message)
      this.stateMachine.send({ type: 'DEDUCT_FAILED', reason: error.message })
    }
  }
  
  private async confirm(ctx: TransactionContext) {
    this.recordStep(ctx, 'confirm', 'pending')
    
    try {
      // 更新订单状态
      await this.orderRepo.updateStatus(ctx.orderId, 'paid')
      
      // 发送通知
      await this.notificationService.send(ctx.userId, {
        type: 'payment_success',
        orderId: ctx.orderId,
        amount: ctx.amount
      })
      
      this.recordStep(ctx, 'confirm', 'success')
      this.stateMachine.send({ type: 'CONFIRM_SUCCESS' })
      
    } catch (error) {
      this.recordStep(ctx, 'confirm', 'failed', error.message)
      // 确认失败也需要回滚
      this.stateMachine.send({ type: 'TIMEOUT' })
    }
  }
  
  // 回滚
  private async rollback(ctx: TransactionContext) {
    this.recordStep(ctx, 'rollback', 'pending')
    
    try {
      // 按逆序执行补偿操作
      for (let i = ctx.steps.length - 1; i >= 0; i--) {
        const step = ctx.steps[i]
        if (step.compensation) {
          await step.compensation()
        }
      }
      
      this.recordStep(ctx, 'rollback', 'success')
      this.stateMachine.send({ type: 'ROLLBACK_COMPLETE' })
      
    } catch (error) {
      // 回滚失败，需要人工介入
      this.recordStep(ctx, 'rollback', 'failed', error.message)
      await this.alertService.notify({
        type: 'transaction_rollback_failed',
        transactionId: ctx.transactionId,
        error: error.message
      })
    }
  }
  
  private recordStep(
    ctx: TransactionContext, 
    step: string, 
    status: StepRecord['status'],
    error?: string,
    compensation?: () => Promise<void>
  ) {
    const existing = ctx.steps.find(s => s.step === step)
    if (existing) {
      existing.status = status
      existing.completedAt = Date.now()
      existing.error = error
      existing.compensation = compensation
    } else {
      ctx.steps.push({
        step,
        status,
        startedAt: Date.now(),
        completedAt: Date.now(),
        error,
        compensation
      })
    }
    
    this.transactionRepo.save(ctx)
  }
  
  // 处理已存在的交易（幂等）
  private async handleExistingTransaction(existing: TransactionContext): Promise<TransactionResult> {
    // 如果还在进行中，等待结果
    if (!['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(existing.state)) {
      return this.waitForCompletion(existing.transactionId)
    }
    
    return {
      transactionId: existing.transactionId,
      status: existing.state,
      success: existing.state === 'SUCCESS'
    }
  }
}

// ==================== React Hook ====================
function useTransaction() {
  const [progress, setProgress] = useState<TransactionContext | null>(null)
  const orchestratorRef = useRef<TransactionOrchestrator>()
  
  useEffect(() => {
    orchestratorRef.current = new TransactionOrchestrator()
  }, [])
  
  const execute = useCallback(async (params: TransactionParams) => {
    // 订阅进度更新
    const unsubscribe = orchestratorRef.current?.subscribe(params.transactionId, (ctx) => {
      setProgress(ctx)
    })
    
    try {
      const result = await orchestratorRef.current?.execute(params)
      return result
    } finally {
      unsubscribe?.()
    }
  }, [])
  
  return { progress, execute }
}

// ==================== 支付组件 ====================
function PaymentPage({ order }: { order: Order }) {
  const { progress, execute } = useTransaction()
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle')
  
  const handlePay = async () => {
    setStatus('processing')
    
    const result = await execute({
      orderId: order.id,
      userId: order.userId,
      amount: order.amount,
      idempotencyKey: \`pay_\${order.id}_\${Date.now()}\`
    })
    
    setStatus(result?.success ? 'success' : 'failed')
  }
  
  return (
    <div className="payment-page">
      {/* 进度展示 */}
      {progress && (
        <div className="progress">
          {progress.steps.map((step, i) => (
            <div key={i} className={\`step \${step.status}\`}>
              <span className="icon">
                {step.status === 'success' ? '✅' : step.status === 'failed' ? '❌' : '⏳'}
              </span>
              <span>{step.step}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* 操作按钮 */}
      <button 
        onClick={handlePay} 
        disabled={status === 'processing'}
      >
        {status === 'processing' ? '处理中...' : '确认支付'}
      </button>
    </div>
  )
}

// 🎯 核心价值：
// 1. 状态机保证流程可控
// 2. 幂等性防止重复执行
// 3. 分布式锁防止并发
// 4. 补偿机制保证回滚
// 5. 进度可追踪`,
    designPattern: '交易状态机 + 补偿机制 + 幂等性设计'
  },

  // ==================== 第五批：更多架构模式 ====================
  {
    id: 'eventbus',
    title: '事件总线与发布订阅',
    subtitle: '组件解耦的核心手段',
    difficulty: 4,
    tags: ['发布订阅', '事件总线', '观察者模式'],
    category: '架构模式',
    problem: `组件间通信是前端最常见的问题：

**实际场景：**

1. **跨层级通信** - 深层组件需要通知顶层
2. **兄弟组件通信** - 两个不相关的组件需要同步
3. **全局状态变化** - 用户登录/登出、主题切换
4. **模块解耦** - A模块不想依赖B模块
5. **插件通信** - 插件间需要协同

**常见痛点：**

1. Props 逐层传递 - prop drilling
2. Context 滥用 - 所有状态塞进 Context
3. 状态提升 - 把状态提升到公共祖先
4. 直接引用 - 组件A直接调用组件B的方法

典型烂代码特征：
- 组件间直接相互引用
- 一层层传 props
- 全局变量满天飞`,
    badCode: `// ❌ 典型屎山：组件间通信混乱

// 问题1: prop drilling - 一层层传
function App() {
  const [user, setUser] = useState(null)
  return <Layout user={user} setUser={setUser} />
}

function Layout({ user, setUser }) {
  return <Sidebar user={user} setUser={setUser} />
}

function Sidebar({ user, setUser }) {
  return <UserPanel user={user} setUser={setUser} />
}

function UserPanel({ user, setUser }) {
  // 终于用到了...
  return <div>{user?.name}</div>
}

// 问题2: 兄弟组件直接引用
const refA = useRef()
const refB = useRef()

function ComponentA() {
  return <div ref={refA}>A</div>
}

function ComponentB() {
  // B直接操作A - 强耦合
  const handleClick = () => {
    refA.current.style.color = 'red'
  }
}

// 问题3: 全局变量
window.currentUser = user  // 污染全局
window.notifications = []  // 到处都是`,
    goodCode: `// ✅ 优雅设计：事件总线 + 发布订阅

// ==================== 事件总线核心 ====================
type EventHandler<T = any> = (data: T) => void

class EventBus {
  private events = new Map<string, Set<EventHandler>>()
  private onceEvents = new Map<string, Set<EventHandler>>()
  private history = new Map<string, any[]>()  // 事件历史（用于粘性事件）
  
  // 订阅事件
  on<T>(event: string, handler: EventHandler<T>) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(handler)
    
    // 返回取消订阅函数
    return () => this.off(event, handler)
  }
  
  // 一次性订阅
  once<T>(event: string, handler: EventHandler<T>) {
    if (!this.onceEvents.has(event)) {
      this.onceEvents.set(event, new Set())
    }
    this.onceEvents.get(event)!.add(handler)
    return () => this.onceEvents.get(event)?.delete(handler)
  }
  
  // 发布事件
  emit<T>(event: string, data: T) {
    // 触发普通订阅
    this.events.get(event)?.forEach(handler => handler(data))
    
    // 触发一次性订阅
    const onceHandlers = this.onceEvents.get(event)
    if (onceHandlers) {
      onceHandlers.forEach(handler => handler(data))
      this.onceEvents.delete(event)
    }
    
    // 记录历史
    if (!this.history.has(event)) {
      this.history.set(event, [])
    }
    this.history.get(event)!.push(data)
  }
  
  // 粘性事件：新订阅者立即收到最后一次事件
  onSticky<T>(event: string, handler: EventHandler<T>) {
    const unsubscribe = this.on(event, handler)
    
    // 立即触发最后一次事件
    const history = this.history.get(event)
    if (history && history.length > 0) {
      handler(history[history.length - 1])
    }
    
    return unsubscribe
  }
  
  // 取消订阅
  off(event: string, handler: EventHandler) {
    this.events.get(event)?.delete(handler)
  }
  
  // 清空事件
  clear(event?: string) {
    if (event) {
      this.events.delete(event)
      this.onceEvents.delete(event)
      this.history.delete(event)
    } else {
      this.events.clear()
      this.onceEvents.clear()
      this.history.clear()
    }
  }
}

// ==================== 全局事件总线 ====================
const globalBus = new EventBus()

// 定义事件类型（类型安全）
interface AppEvents {
  'user:login': { userId: string; name: string }
  'user:logout': {}
  'cart:update': { itemCount: number }
  'notification:show': { type: 'success' | 'error'; message: string }
  'theme:change': { theme: 'light' | 'dark' }
}

// 类型安全的 emit 和 on
function emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]) {
  globalBus.emit(event, data)
}

function on<K extends keyof AppEvents>(
  event: K, 
  handler: (data: AppEvents[K]) => void
) {
  return globalBus.on(event, handler)
}

// ==================== React Hook 封装 ====================
function useEventBus<K extends keyof AppEvents>(
  event: K,
  handler: (data: AppEvents[K]) => void,
  deps: any[] = []
) {
  useEffect(() => {
    return globalBus.on(event, handler)
  }, [event, ...deps])
}

function useEventEmitter() {
  return { emit }
}

// ==================== 使用示例 ====================

// 登录组件
function LoginForm() {
  const handleLogin = async (credentials) => {
    const user = await login(credentials)
    
    // 发布登录事件
    emit('user:login', { userId: user.id, name: user.name })
  }
  
  return <form>...</form>
}

// 导航栏（在应用任意位置）
function NavBar() {
  const [userName, setUserName] = useState('')
  
  // 订阅登录事件
  useEventBus('user:login', (data) => {
    setUserName(data.name)
  }, [])
  
  // 订阅登出事件
  useEventBus('user:logout', () => {
    setUserName('')
  }, [])
  
  return (
    <nav>
      {userName && <span>欢迎, {userName}</span>}
    </nav>
  )
}

// 购物车图标（完全解耦）
function CartIcon() {
  const [count, setCount] = useState(0)
  
  useEventBus('cart:update', (data) => {
    setCount(data.itemCount)
  }, [])
  
  return <Badge count={count}>🛒</Badge>
}

// 通知组件（全局单例）
function NotificationProvider() {
  const [notifications, setNotifications] = useState([])
  
  useEventBus('notification:show', (data) => {
    const id = Date.now()
    setNotifications(prev => [...prev, { ...data, id }])
    
    // 3秒后自动消失
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 3000)
  }, [])
  
  return (
    <div className="notification-container">
      {notifications.map(n => (
        <div key={n.id} className={\`notification \${n.type}\`}>
          {n.message}
        </div>
      ))}
    </div>
  )
}

// 任意组件都可以发通知
function SomeComponent() {
  const { emit } = useEventEmitter()
  
  const handleSave = async () => {
    try {
      await saveData()
      emit('notification:show', { type: 'success', message: '保存成功' })
    } catch (error) {
      emit('notification:show', { type: 'error', message: '保存失败' })
    }
  }
}

// ==================== 模块间解耦 ====================

// 支付模块 - 不依赖购物车模块
class PaymentModule {
  constructor(private bus: EventBus) {
    // 监听订单创建事件
    this.bus.on('order:created', this.handleOrderCreated)
  }
  
  private handleOrderCreated = (order) => {
    // 处理支付
  }
}

// 库存模块 - 不依赖支付模块
class InventoryModule {
  constructor(private bus: EventBus) {
    this.bus.on('order:paid', this.handleOrderPaid)
  }
  
  private handleOrderPaid = (order) => {
    // 扣减库存
  }
}

// 通过事件串联业务流程
// 订单创建 -> 支付成功 -> 扣减库存 -> 发货通知

// 🎯 核心价值：
// 1. 组件完全解耦，互不依赖
// 2. 类型安全的事件系统
// 3. 支持 React Hook 风格
// 4. 模块间松耦合通信
// 5. 易于扩展新的事件监听者`,
    designPattern: '发布订阅模式 + 观察者模式'
  },
  {
    id: 'strategy',
    title: '策略模式实战',
    subtitle: '消除 if-else 地狱',
    difficulty: 4,
    tags: ['策略模式', '开放封闭', '多态'],
    category: '架构模式',
    problem: `策略模式是最实用但最被低估的模式：

**实际场景：**

1. **支付方式选择** - 支付宝、微信、银行卡、Apple Pay
2. **排序算法** - 价格排序、销量排序、评分排序
3. **验证规则** - 邮箱验证、手机验证、身份证验证
4. **导出格式** - Excel、PDF、CSV、JSON
5. **图表类型** - 折线图、柱状图、饼图

**为什么要用策略模式？**

传统 if-else 的问题：
- 代码越来越长
- 加新策略要改原代码
- 无法动态扩展
- 测试困难

典型烂代码特征：
- 一堆 if-else 或 switch-case
- 相同逻辑重复写
- 策略写死在代码里`,
    badCode: `// ❌ 典型屎山：if-else 地狱

function calculateDiscount(type, user, order) {
  if (type === 'vip') {
    if (user.level === 'gold') {
      return order.amount * 0.8
    } else if (user.level === 'silver') {
      return order.amount * 0.9
    } else if (user.level === 'bronze') {
      return order.amount * 0.95
    }
  } else if (type === 'coupon') {
    if (order.amount >= 100) {
      return 20
    } else if (order.amount >= 50) {
      return 10
    }
  } else if (type === 'points') {
    return user.points * 0.01
  } else if (type === 'festival') {
    // 又是各种判断...
  } else if (type === 'newuser') {
    // ...
  }
  // 加新类型要在这里继续加 else if
  return 0
}

// 另一个函数又是类似的 if-else
function getDiscountLabel(type) {
  if (type === 'vip') return '会员折扣'
  else if (type === 'coupon') return '优惠券'
  else if (type === 'points') return '积分抵扣'
  // 又要重复写一遍...
}

// 问题：
// 1. 代码冗长，难以维护
// 2. 加新策略要改多处
// 3. 每次改动可能引入 bug
// 4. 无法单元测试单个策略`,
    goodCode: `// ✅ 优雅设计：策略模式

// ==================== 策略接口 ====================
interface DiscountStrategy {
  id: string
  name: string
  calculate(user: User, order: Order): number
  isApplicable(user: User, order: Order): boolean
}

// ==================== 具体策略 ====================

// VIP会员折扣策略
const vipStrategy: DiscountStrategy = {
  id: 'vip',
  name: '会员折扣',
  
  calculate(user, order) {
    const rates = {
      'gold': 0.8,
      'silver': 0.9,
      'bronze': 0.95
    }
    return order.amount * (1 - rates[user.level] || 1)
  },
  
  isApplicable(user) {
    return ['gold', 'silver', 'bronze'].includes(user.level)
  }
}

// 优惠券策略
const couponStrategy: DiscountStrategy = {
  id: 'coupon',
  name: '优惠券',
  
  calculate(user, order) {
    const thresholds = [
      { min: 100, discount: 20 },
      { min: 50, discount: 10 },
      { min: 0, discount: 0 }
    ]
    const matched = thresholds.find(t => order.amount >= t.min)
    return matched?.discount || 0
  },
  
  isApplicable(user, order) {
    return order.amount >= 50
  }
}

// 积分抵扣策略
const pointsStrategy: DiscountStrategy = {
  id: 'points',
  name: '积分抵扣',
  
  calculate(user) {
    return Math.min(user.points * 0.01, 50)  // 最多抵扣50元
  },
  
  isApplicable(user) {
    return user.points >= 100
  }
}

// 新用户首单策略
const newUserStrategy: DiscountStrategy = {
  id: 'newuser',
  name: '新用户首单',
  
  calculate(user, order) {
    return Math.min(order.amount * 0.2, 30)  // 8折，最多减30
  },
  
  isApplicable(user) {
    return user.orderCount === 0
  }
}

// ==================== 策略注册表 ====================
class StrategyRegistry<T> {
  private strategies = new Map<string, T>()
  
  register(strategy: T & { id: string }) {
    this.strategies.set(strategy.id, strategy)
    return this
  }
  
  get(id: string): T | undefined {
    return this.strategies.get(id)
  }
  
  getAll(): T[] {
    return Array.from(this.strategies.values())
  }
  
  // 找出所有适用的策略
  getApplicable(context: any, predicate: (s: T, ctx: any) => boolean): T[] {
    return this.getAll().filter(s => predicate(s, context))
  }
}

// ==================== 折扣计算引擎 ====================
class DiscountEngine {
  private registry = new StrategyRegistry<DiscountStrategy>()
  
  constructor() {
    // 注册所有策略
    this.registry
      .register(vipStrategy)
      .register(couponStrategy)
      .register(pointsStrategy)
      .register(newUserStrategy)
  }
  
  // 计算单个折扣
  calculate(strategyId: string, user: User, order: Order): number {
    const strategy = this.registry.get(strategyId)
    if (!strategy || !strategy.isApplicable(user, order)) {
      return 0
    }
    return strategy.calculate(user, order)
  }
  
  // 计算所有可用折扣
  calculateAll(user: User, order: Order): Array<{ id: string; name: string; amount: number }> {
    return this.registry
      .getApplicable(
        { user, order },
        (s, ctx) => s.isApplicable(ctx.user, ctx.order)
      )
      .map(s => ({
        id: s.id,
        name: s.name,
        amount: s.calculate(user, order)
      }))
  }
  
  // 动态注册新策略（插件化）
  registerStrategy(strategy: DiscountStrategy) {
    this.registry.register(strategy)
  }
}

// ==================== React Hook ====================
function useDiscountEngine() {
  const engine = useMemo(() => new DiscountEngine(), [])
  
  const calculateDiscount = useCallback((strategyId: string, user: User, order: Order) => {
    return engine.calculate(strategyId, user, order)
  }, [engine])
  
  const getAvailableDiscounts = useCallback((user: User, order: Order) => {
    return engine.calculateAll(user, order)
  }, [engine])
  
  return { calculateDiscount, getAvailableDiscounts }
}

// ==================== 使用示例 ====================
function OrderSummary({ user, order }: { user: User; order: Order }) {
  const { getAvailableDiscounts } = useDiscountEngine()
  
  const discounts = useMemo(() => 
    getAvailableDiscounts(user, order),
    [user, order, getAvailableDiscounts]
  )
  
  const [selectedId, setSelectedId] = useState<string>()
  
  const selected = discounts.find(d => d.id === selectedId)
  
  return (
    <div>
      <h3>可用优惠</h3>
      {discounts.map(d => (
        <label key={d.id}>
          <input 
            type="radio" 
            checked={selectedId === d.id}
            onChange={() => setSelectedId(d.id)}
          />
          {d.name}: -¥{d.amount.toFixed(2)}
        </label>
      ))}
      
      <div className="total">
        应付: ¥{(order.amount - (selected?.amount || 0)).toFixed(2)}
      </div>
    </div>
  )
}

// ==================== 扩展：配置化策略 ====================
const strategyConfigs = [
  {
    id: 'festival',
    name: '节日优惠',
    config: {
      startDate: '2024-01-01',
      endDate: '2024-01-03',
      discount: 0.9
    }
  }
]

// 动态创建策略
function createFestivalStrategy(config) {
  return {
    id: config.id,
    name: config.name,
    
    calculate(user, order) {
      return order.amount * (1 - config.config.discount)
    },
    
    isApplicable(user, order) {
      const now = Date.now()
      return now >= new Date(config.config.startDate).getTime() &&
             now <= new Date(config.config.endDate).getTime()
    }
  }
}

// 动态注册
const engine = new DiscountEngine()
strategyConfigs.forEach(config => {
  engine.registerStrategy(createFestivalStrategy(config))
})

// 🎯 核心价值：
// 1. 消除 if-else，代码清晰
// 2. 新增策略不改原代码
// 3. 策略可配置、可动态加载
// 4. 每个策略独立测试
// 5. 策略可组合使用`,
    designPattern: '策略模式 + 开放封闭原则'
  },
  {
    id: 'pipeline',
    title: '管道模式',
    subtitle: '数据处理链的最佳实践',
    difficulty: 4,
    tags: ['管道模式', '链式处理', '数据流'],
    category: '架构模式',
    problem: `数据处理是前端最常见的场景：

**实际场景：**

1. **表单数据处理** - 原始值 → 格式化 → 校验 → 转换 → 提交
2. **API响应处理** - 响应 → 解析 → 过滤 → 缓存 → 返回
3. **文件上传** - 选择 → 校验 → 压缩 → 加密 → 分片 → 上传
4. **日志处理** - 收集 → 格式化 → 过滤 → 聚合 → 上报
5. **搜索处理** - 输入 → 分词 → 搜索 → 高亮 → 排序 → 返回

**为什么需要管道模式？**

传统方式的痛点：
- 处理步骤耦合在一起
- 难以复用单个处理步骤
- 难以调整处理顺序
- 加新步骤要改原代码

典型烂代码特征：
- 一个函数包含所有处理逻辑
- 处理步骤硬编码
- 无法跳过某个步骤`,
    badCode: `// ❌ 典型屎山：处理步骤耦合

async function processFormData(formData) {
  // 所有步骤写在一个函数里
  
  // 步骤1: 格式化
  const formatted = {
    ...formData,
    phone: formData.phone.replace(/\\D/g, ''),
    email: formData.email.toLowerCase().trim()
  }
  
  // 步骤2: 校验
  if (!formatted.name) {
    throw new Error('姓名必填')
  }
  if (!formatted.email.includes('@')) {
    throw new Error('邮箱格式错误')
  }
  // ... 更多校验
  
  // 步骤3: 转换
  const transformed = {
    ...formatted,
    fullName: \`\${formatted.firstName} \${formatted.lastName}\`,
    createdAt: new Date().toISOString()
  }
  
  // 步骤4: 提交
  const response = await fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(transformed)
  })
  
  // 步骤5: 后处理
  const result = await response.json()
  
  // 问题：
  // 1. 加新步骤要改这个函数
  // 2. 某些场景想跳过校验？没法做
  // 3. 想复用格式化逻辑？只能复制
  // 4. 测试困难
}`,
    goodCode: `// ✅ 优雅设计：管道模式

// ==================== 管道核心 ====================
type PipeFunction<T> = (input: T) => T | Promise<T>

class Pipeline<T> {
  private pipes: PipeFunction<T>[] = []
  
  // 添加处理步骤
  pipe(fn: PipeFunction<T>): this {
    this.pipes.push(fn)
    return this
  }
  
  // 条件添加
  pipeIf(condition: boolean, fn: PipeFunction<T>): this {
    if (condition) {
      this.pipes.push(fn)
    }
    return this
  }
  
  // 执行管道
  async process(initial: T): Promise<T> {
    let result = initial
    
    for (const pipe of this.pipes) {
      result = await pipe(result)
    }
    
    return result
  }
  
  // 创建分支管道
  branch(predicate: (input: T) => boolean, truePipe: Pipeline<T>, falsePipe?: Pipeline<T>): this {
    this.pipes.push(async (input) => {
      if (predicate(input)) {
        return truePipe.process(input)
      } else if (falsePipe) {
        return falsePipe.process(input)
      }
      return input
    })
    return this
  }
  
  // 并行处理
  parallel(...pipes: PipeFunction<T>[]): this {
    this.pipes.push(async (input) => {
      const results = await Promise.all(
        pipes.map(pipe => pipe(input))
      )
      // 合并结果
      return Object.assign({}, input, ...results)
    })
    return this
  }
}

// ==================== 表单处理管道 ====================

// 格式化管道
const formatPipe = <T extends FormData>(input: T): T => ({
  ...input,
  phone: input.phone?.replace(/\\D/g, ''),
  email: input.email?.toLowerCase().trim(),
  name: input.name?.trim()
})

// 校验管道
const validatePipe = <T extends FormData>(input: T): T => {
  const errors: string[] = []
  
  if (!input.name) errors.push('姓名必填')
  if (!input.email?.includes('@')) errors.push('邮箱格式错误')
  if (input.phone && input.phone.length !== 11) errors.push('手机号格式错误')
  
  if (errors.length > 0) {
    throw new ValidationError(errors)
  }
  
  return input
}

// 转换管道
const transformPipe = <T extends FormData>(input: T): T => ({
  ...input,
  fullName: \`\${input.firstName || ''} \${input.lastName || ''}\`.trim(),
  createdAt: new Date().toISOString()
})

// 提交管道
const createSubmitPipe = (url: string) => 
  async <T extends FormData>(input: T): Promise<T & { response: Response }> => {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(input)
    })
    return { ...input, response }
  }

// 组装管道
function createFormPipeline(config: { skipValidation?: boolean } = {}) {
  const pipeline = new Pipeline<FormData>()
    .pipe(formatPipe)
    .pipeIf(!config.skipValidation, validatePipe)
    .pipe(transformPipe)
    .pipe(createSubmitPipe('/api/submit'))
  
  return pipeline
}

// 使用
async function submitForm(formData: FormData) {
  const pipeline = createFormPipeline()
  const result = await pipeline.process(formData)
  return result.response
}

// ==================== 数据处理管道 ====================

// 过滤管道
const createFilterPipe = <T>(predicate: (item: T) => boolean) => 
  (items: T[]): T[] => items.filter(predicate)

// 映射管道
const createMapPipe = <T, R>(mapper: (item: T) => R) =>
  (items: T[]): R[] => items.map(mapper)

// 排序管道
const createSortPipe = <T>(compare: (a: T, b: T) => number) =>
  (items: T[]): T[] => [...items].sort(compare)

// 分组管道
const createGroupPipe = <T, K extends string | number>(keyFn: (item: T) => K) =>
  (items: T[]): Record<K, T[]> => 
    items.reduce((groups, item) => {
      const key = keyFn(item)
      ;(groups[key] = groups[key] || []).push(item)
      return groups
    }, {} as Record<K, T[]>)

// 使用示例：处理商品列表
const productPipeline = new Pipeline<Product[]>()
  .pipe(createFilterPipe(p => p.stock > 0))        // 只保留有库存的
  .pipe(createSortPipe((a, b) => b.sales - a.sales)) // 按销量排序
  .pipe(createMapPipe(p => ({                      // 转换格式
    ...p,
    displayPrice: \`¥\${p.price.toFixed(2)}\`
  })))

const processedProducts = await productPipeline.process(rawProducts)

// ==================== API响应管道 ====================

interface APIResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}

// 解析管道
const parsePipe = async <T>(response: Response): Promise<APIResponse<T>> => ({
  data: await response.json(),
  status: response.status,
  headers: Object.fromEntries(response.headers.entries())
})

// 错误处理管道
const errorPipe = <T>(response: APIResponse<T>): APIResponse<T> => {
  if (response.status >= 400) {
    throw new APIError(response.status, response.data)
  }
  return response
}

// 缓存管道
const createCachePipe = <T>(key: string, ttl: number) => {
  const cache = new Map<string, { data: T; expires: number }>()
  
  return async (response: APIResponse<T>): Promise<APIResponse<T>> => {
    const cached = cache.get(key)
    if (cached && Date.now() < cached.expires) {
      return { ...response, data: cached.data }
    }
    
    cache.set(key, { data: response.data, expires: Date.now() + ttl })
    return response
  }
}

// 组装 API 管道
function createAPIPipeline<T>(cacheKey?: string) {
  const pipeline = new Pipeline<Response>()
    .pipe(parsePipe)
    .pipe(errorPipe)
  
  if (cacheKey) {
    pipeline.pipe(createCachePipe<T>(cacheKey, 60000))
  }
  
  return pipeline
}

// 使用
async function fetchUser(id: string) {
  const pipeline = createAPIPipeline<User>(\`user_\${id}\`)
  const response = await fetch(\`/api/user/\${id}\`)
  const result = await pipeline.process(response)
  return result.data
}

// ==================== 文件处理管道 ====================

interface FileContext {
  file: File
  data?: Blob
  metadata?: { size: number; type: string }
  chunks?: Blob[]
  uploaded?: { url: string }
}

// 校验管道
const createFileValidatePipe = (maxSize: number, allowedTypes: string[]) =>
  (ctx: FileContext): FileContext => {
    if (ctx.file.size > maxSize) {
      throw new Error(\`文件大小超过限制 \${maxSize}字节\`)
    }
    if (!allowedTypes.includes(ctx.file.type)) {
      throw new Error(\`不支持的文件类型: \${ctx.file.type}\`)
    }
    return ctx
  }

// 压缩管道
const compressPipe = async (ctx: FileContext): Promise<FileContext> => {
  if (!ctx.file.type.startsWith('image/')) return ctx
  
  const compressed = await compressImage(ctx.file, { quality: 0.8 })
  return { ...ctx, data: compressed }
}

// 分片管道
const chunkPipe = (ctx: FileContext): FileContext => {
  const chunkSize = 5 * 1024 * 1024  // 5MB
  const chunks: Blob[] = []
  const data = ctx.data || ctx.file
  
  for (let i = 0; i < data.size; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize))
  }
  
  return { ...ctx, chunks }
}

// 上传管道
const uploadPipe = async (ctx: FileContext): Promise<FileContext> => {
  const urls = await uploadChunks(ctx.chunks!)
  return { ...ctx, uploaded: { url: urls.join(',') } }
}

// 组装文件上传管道
const uploadPipeline = new Pipeline<FileContext>()
  .pipe(createFileValidatePipe(100 * 1024 * 1024, ['image/jpeg', 'image/png']))
  .pipe(compressPipe)
  .pipe(chunkPipe)
  .pipe(uploadPipe)

// 🎯 核心价值：
// 1. 处理步骤解耦，可独立复用
// 2. 管道可配置、可动态组装
// 3. 支持条件分支和并行
// 4. 易于测试单个管道
// 5. 易于扩展新处理步骤`,
    designPattern: '管道模式 + 责任链模式'
  },

  // ==================== 第六批：更多领域场景 ====================
  {
    id: 'im',
    title: 'IM即时通讯',
    subtitle: '消息存储与未读数设计',
    difficulty: 5,
    tags: ['消息存储', '未读数', '消息同步'],
    category: '社交领域',
    problem: `IM系统是前端最复杂的场景之一：

**核心挑战：**

1. **消息存储** - 本地存储 + 服务端同步
2. **未读数管理** - 会话未读、总未读、@未读
3. **消息顺序** - 时间戳排序、消息去重
4. **离线消息** - 断网期间的消息如何同步
5. **多端同步** - 手机、电脑同时在线

**典型坑：**

1. 未读数不准 - 明明读了还显示红点
2. 消息丢失 - 发出去了但没显示
3. 消息乱序 - 后发的消息跑到前面
4. 性能问题 - 万条消息卡顿

典型烂代码特征：
- 消息和会话状态分散
- 未读数靠手动维护
- 没有消息去重`,
    badCode: `// ❌ 典型屎山IM

function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  
  // 问题1: 没有本地存储，刷新就丢消息
  useEffect(() => {
    ws.on('message', (msg) => {
      setMessages(prev => [...prev, msg])
      // 问题2: 未读数简单+1，不准确
      setUnread(prev => prev + 1)
    })
  }, [])
  
  // 问题3: 标记已读只是改数字，没同步服务器
  const markRead = () => {
    setUnread(0)
  }
  
  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：完整的IM架构

// ==================== 消息存储 ====================
interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: 'text' | 'image' | 'file'
  status: 'sending' | 'sent' | 'failed'
  timestamp: number
  seq: number  // 服务端序列号，用于排序和去重
}

interface Conversation {
  id: string
  type: 'single' | 'group'
  participants: string[]
  lastMessage?: Message
  unreadCount: number
  mentioned: boolean  // 是否有@我
  readSeq: number     // 已读到的序列号
}

// ==================== 消息存储层 ====================
class MessageStore {
  private db: IDBDatabase
  private messageIndex = new Map<string, Set<string>>()  // conversation -> messageIds
  
  async init() {
    this.db = await this.openDB()
  }
  
  // 存储消息
  async saveMessage(message: Message) {
    const tx = this.db.transaction(['messages', 'conversations'], 'readwrite')
    
    // 存消息
    tx.objectStore('messages').put(message)
    
    // 更新会话最新消息
    const convStore = tx.objectStore('conversations')
    const conv = await convStore.get(message.conversationId)
    if (conv) {
      conv.lastMessage = message
      convStore.put(conv)
    }
    
    // 更新内存索引
    if (!this.messageIndex.has(message.conversationId)) {
      this.messageIndex.set(message.conversationId, new Set())
    }
    this.messageIndex.get(message.conversationId)!.add(message.id)
    
    await tx.done
  }
  
  // 批量存储（同步离线消息）
  async saveMessages(messages: Message[]) {
    const tx = this.db.transaction(['messages'], 'readwrite')
    for (const msg of messages) {
      tx.objectStore('messages').put(msg)
    }
    await tx.done
  }
  
  // 获取会话消息
  async getMessages(conversationId: string, options?: {
    before?: string
    limit?: number
  }): Promise<Message[]> {
    const store = this.db.transaction('messages').objectStore('messages')
    const index = store.index('conversation-timestamp')
    
    let range: IDBKeyRange
    if (options?.before) {
      const beforeMsg = await store.get(options.before)
      range = IDBKeyRange.bound(
        [conversationId, 0],
        [conversationId, beforeMsg.timestamp],
        false, true
      )
    } else {
      range = IDBKeyRange.bound(
        [conversationId, 0],
        [conversationId, Infinity]
      )
    }
    
    const messages = await index.getAll(range)
    return messages.slice(- (options?.limit || 50))
  }
  
  // 去重检查
  isDuplicate(messageId: string): boolean {
    for (const ids of this.messageIndex.values()) {
      if (ids.has(messageId)) return true
    }
    return false
  }
}

// ==================== 未读数管理 ====================
class UnreadManager {
  private conversations = new Map<string, Conversation>()
  private listeners = new Set<(stats: UnreadStats) => void>()
  
  interface UnreadStats {
    total: number
    conversations: Array<{ id: string; count: number; mentioned: boolean }>
  }
  
  // 更新会话未读
  incrementUnread(conversationId: string, mentioned: boolean) {
    const conv = this.conversations.get(conversationId)
    if (!conv) return
    
    conv.unreadCount++
    if (mentioned) conv.mentioned = true
    
    this.notify()
  }
  
  // 标记已读
  async markRead(conversationId: string, readSeq: number) {
    const conv = this.conversations.get(conversationId)
    if (!conv) return
    
    conv.unreadCount = 0
    conv.mentioned = false
    conv.readSeq = readSeq
    
    // 同步到服务器
    await api.markRead(conversationId, readSeq)
    
    this.notify()
  }
  
  // 获取未读统计
  getStats(): UnreadStats {
    const conversations = Array.from(this.conversations.entries())
      .filter(([_, conv]) => conv.unreadCount > 0)
      .map(([id, conv]) => ({
        id,
        count: conv.unreadCount,
        mentioned: conv.mentioned
      }))
    
    return {
      total: conversations.reduce((sum, c) => sum + c.count, 0),
      conversations
    }
  }
  
  private notify() {
    const stats = this.getStats()
    this.listeners.forEach(l => l(stats))
  }
  
  subscribe(listener: (stats: UnreadStats) => void) {
    this.listeners.add(listener)
    listener(this.getStats())
    return () => this.listeners.delete(listener)
  }
}

// ==================== 消息同步器 ====================
class MessageSyncer {
  private store: MessageStore
  private unread: UnreadManager
  private ws: WebSocket
  private syncSeq = 0  // 已同步到的序列号
  
  constructor(store: MessageStore, unread: UnreadManager) {
    this.store = store
    this.unread = unread
  }
  
  async connect() {
    this.ws = new WebSocket(WS_URL)
    
    this.ws.onopen = () => {
      // 发送同步请求
      this.ws.send(JSON.stringify({
        type: 'sync',
        lastSeq: this.syncSeq
      }))
    }
    
    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      this.handleMessage(data)
    }
  }
  
  private async handleMessage(data: any) {
    switch (data.type) {
      case 'messages':
        // 批量同步离线消息
        await this.handleBatchMessages(data.messages)
        break
      
      case 'message':
        // 单条新消息
        await this.handleNewMessage(data.message)
        break
      
      case 'ack':
        // 消息送达确认
        await this.handleAck(data)
        break
      
      case 'read':
        // 对方已读
        await this.handleReadReceipt(data)
        break
    }
  }
  
  private async handleBatchMessages(messages: Message[]) {
    // 按序列号排序
    messages.sort((a, b) => a.seq - b.seq)
    
    // 去重并存储
    for (const msg of messages) {
      if (this.store.isDuplicate(msg.id)) continue
      
      await this.store.saveMessage(msg)
      this.syncSeq = Math.max(this.syncSeq, msg.seq)
      
      // 更新未读（不在当前会话时）
      if (msg.conversationId !== currentConversationId) {
        this.unread.incrementUnread(msg.conversationId, this.checkMention(msg))
      }
    }
  }
  
  private async handleNewMessage(msg: Message) {
    if (this.store.isDuplicate(msg.id)) return
    
    await this.store.saveMessage(msg)
    this.syncSeq = Math.max(this.syncSeq, msg.seq)
    
    // 通知UI更新
    this.emit('newMessage', msg)
  }
  
  // 发送消息
  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const message: Message = {
      id: generateId(),
      conversationId,
      senderId: currentUserId,
      content,
      type: 'text',
      status: 'sending',
      timestamp: Date.now(),
      seq: 0  // 服务端分配
    }
    
    // 先本地存储
    await this.store.saveMessage(message)
    
    // 发送到服务器
    this.ws.send(JSON.stringify({
      type: 'send',
      message
    }))
    
    return message
  }
}

// ==================== React Hook ====================
function useIM() {
  const store = useRef<MessageStore>()
  const syncer = useRef<MessageSyncer>()
  const [messages, setMessages] = useState<Message[]>([])
  const [unreadStats, setUnreadStats] = useState<UnreadStats>({ total: 0, conversations: [] })
  
  useEffect(() => {
    const msgStore = new MessageStore()
    const unreadMgr = new UnreadManager()
    const msgSyncer = new MessageSyncer(msgStore, unreadMgr)
    
    store.current = msgStore
    syncer.current = msgSyncer
    
    msgStore.init().then(() => {
      msgSyncer.connect()
    })
    
    // 订阅未读数变化
    unreadMgr.subscribe(setUnreadStats)
    
    // 订阅新消息
    msgSyncer.on('newMessage', (msg) => {
      if (msg.conversationId === currentConversationId) {
        setMessages(prev => [...prev, msg])
      }
    })
    
    return () => msgSyncer.disconnect()
  }, [])
  
  const loadMessages = useCallback(async (conversationId: string) => {
    const msgs = await store.current?.getMessages(conversationId)
    setMessages(msgs || [])
  }, [])
  
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    return syncer.current?.sendMessage(conversationId, content)
  }, [])
  
  const markRead = useCallback(async (conversationId: string) => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg) {
      await syncer.current?.markRead(conversationId, lastMsg.seq)
    }
  }, [messages])
  
  return { messages, unreadStats, loadMessages, sendMessage, markRead }
}

// ==================== 组件使用 ====================
function ConversationList() {
  const { unreadStats } = useIM()
  
  return (
    <div className="conv-list">
      {unreadStats.conversations.map(conv => (
        <div key={conv.id} className={conv.mentioned ? 'mentioned' : ''}>
          <span className="name">{conv.id}</span>
          {conv.count > 0 && (
            <span className="badge">{conv.count > 99 ? '99+' : conv.count}</span>
          )}
        </div>
      ))}
      
      <div className="total-badge">
        {unreadStats.total > 0 && (
          <span>{unreadStats.total}条未读</span>
        )}
      </div>
    </div>
  )
}

function ChatRoom({ conversationId }: { conversationId: string }) {
  const { messages, loadMessages, sendMessage, markRead } = useIM()
  
  useEffect(() => {
    loadMessages(conversationId)
  }, [conversationId])
  
  // 进入会话自动标记已读
  useEffect(() => {
    markRead(conversationId)
  }, [conversationId, messages.length])
  
  const handleSend = async (content: string) => {
    await sendMessage(conversationId, content)
  }
  
  return (
    <div className="chat-room">
      <div className="messages">
        {messages.map(msg => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>
      <MessageInput onSend={handleSend} />
    </div>
  )
}

// 🎯 核心价值：
// 1. 消息持久化，刷新不丢
// 2. 未读数准确，自动同步
// 3. 消息去重，不会重复
// 4. 离线消息，断网可收
// 5. 多端同步，状态一致`,
    designPattern: '消息存储 + 未读管理 + 同步机制'
  },
  {
    id: 'approval',
    title: '审批流引擎',
    subtitle: '工作流与状态机设计',
    difficulty: 5,
    tags: ['工作流', '状态机', '审批链'],
    category: '企业应用',
    problem: `审批流是企业应用最复杂的业务之一：

**实际场景：**

1. **请假审批** - 主管 → 经理 → HR
2. **报销审批** - 直属领导 → 财务 → 总经理
3. **采购审批** - 部门 → 采购部 → 财务 → 总经理
4. **合同审批** - 法务 → 财务 → 业务负责人 → 总经理

**核心挑战：**

1. **多级审批** - 串行审批链
2. **会签** - 多人同时审批
3. **条件分支** - 金额>1万需要总经理
4. **退回/撤回** - 审批不通过怎么办
5. **委托/转交** - 领导出差委托他人

典型烂代码特征：
- 审批逻辑写死在代码里
- 状态转换散落各处
- 没有审批历史`,
    badCode: `// ❌ 典型屎山审批

async function submitApproval(type, data) {
  if (type === 'leave') {
    // 写死的审批链
    const step1 = await submitTo(data, data.managerId)
    if (!step1.approved) return
    
    if (data.days > 3) {
      const step2 = await submitTo(data, data.directorId)
      if (!step2.approved) return
    }
    
    if (data.days > 7) {
      const step3 = await submitTo(data, data.hrId)
      // 又是一堆判断...
    }
  } else if (type === 'expense') {
    // 另一套写死的逻辑
    const step1 = await submitTo(data, data.managerId)
    if (data.amount > 1000) {
      // ...
    }
  }
  // 加新类型要继续加 else if
}`,
    goodCode: `// ✅ 优雅设计：审批流引擎

// ==================== 审批流定义 ====================
interface ApprovalNode {
  id: string
  type: 'single' | 'any' | 'all'  // 单人/或签/会签
  assignee: string | string[] | ((context: ApprovalContext) => string[])
  condition?: (context: ApprovalContext) => boolean
  timeout?: {
    duration: number
    action: 'autoApprove' | 'autoReject' | 'transfer'
    transferTo?: string
  }
}

interface ApprovalFlow {
  id: string
  name: string
  nodes: ApprovalNode[]
  edges: Array<{ from: string; to: string; condition?: (ctx: ApprovalContext) => boolean }>
}

interface ApprovalInstance {
  id: string
  flowId: string
  businessId: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  currentNode: string
  history: ApprovalRecord[]
  context: ApprovalContext
}

interface ApprovalRecord {
  nodeId: string
  approver: string
  action: 'approve' | 'reject' | 'transfer' | 'withdraw'
  comment?: string
  timestamp: number
}

// ==================== 审批流配置示例 ====================
const leaveApprovalFlow: ApprovalFlow = {
  id: 'leave',
  name: '请假审批',
  nodes: [
    {
      id: 'manager',
      type: 'single',
      assignee: (ctx) => ctx.applicant.managerId
    },
    {
      id: 'director',
      type: 'single',
      assignee: (ctx) => ctx.applicant.department.directorId,
      condition: (ctx) => ctx.data.days > 3  // 超过3天需要总监
    },
    {
      id: 'hr',
      type: 'single',
      assignee: 'hr_role',  // 角色
      condition: (ctx) => ctx.data.days > 7  // 超过7天需要HR
    }
  ],
  edges: [
    { from: 'manager', to: 'director', condition: (ctx) => ctx.data.days > 3 },
    { from: 'manager', to: 'hr', condition: (ctx) => ctx.data.days <= 3 && ctx.data.days > 7 },
    { from: 'manager', to: 'end', condition: (ctx) => ctx.data.days <= 3 },
    { from: 'director', to: 'hr', condition: (ctx) => ctx.data.days > 7 },
    { from: 'director', to: 'end', condition: (ctx) => ctx.data.days <= 7 }
  ]
}

const expenseApprovalFlow: ApprovalFlow = {
  id: 'expense',
  name: '报销审批',
  nodes: [
    {
      id: 'manager',
      type: 'single',
      assignee: (ctx) => ctx.applicant.managerId
    },
    {
      id: 'finance',
      type: 'any',  // 任意一个财务审批即可
      assignee: ['finance_1', 'finance_2', 'finance_3'],
      condition: (ctx) => ctx.data.amount > 1000
    },
    {
      id: 'ceo',
      type: 'single',
      assignee: 'ceo',
      condition: (ctx) => ctx.data.amount > 50000
    }
  ],
  edges: [
    { from: 'manager', to: 'finance', condition: (ctx) => ctx.data.amount > 1000 },
    { from: 'manager', to: 'end', condition: (ctx) => ctx.data.amount <= 1000 },
    { from: 'finance', to: 'ceo', condition: (ctx) => ctx.data.amount > 50000 },
    { from: 'finance', to: 'end', condition: (ctx) => ctx.data.amount <= 50000 }
  ]
}

// ==================== 审批引擎 ====================
class ApprovalEngine {
  private flows = new Map<string, ApprovalFlow>()
  private instances = new Map<string, ApprovalInstance>()
  
  // 注册审批流
  register(flow: ApprovalFlow) {
    this.flows.set(flow.id, flow)
  }
  
  // 发起审批
  async start(flowId: string, businessId: string, context: ApprovalContext): Promise<ApprovalInstance> {
    const flow = this.flows.get(flowId)
    if (!flow) throw new Error(\`Flow not found: \${flowId}\`)
    
    const instance: ApprovalInstance = {
      id: generateId(),
      flowId,
      businessId,
      status: 'pending',
      currentNode: flow.nodes[0].id,
      history: [],
      context
    }
    
    // 通知第一个审批人
    await this.notifyApprovers(instance, flow.nodes[0])
    
    this.instances.set(instance.id, instance)
    return instance
  }
  
  // 审批操作
  async approve(
    instanceId: string, 
    action: 'approve' | 'reject' | 'transfer',
    options: { approver: string; comment?: string; transferTo?: string }
  ): Promise<ApprovalInstance> {
    const instance = this.instances.get(instanceId)
    const flow = this.flows.get(instance!.flowId)
    if (!instance || !flow) throw new Error('Instance or flow not found')
    
    // 记录审批历史
    instance.history.push({
      nodeId: instance.currentNode,
      approver: options.approver,
      action,
      comment: options.comment,
      timestamp: Date.now()
    })
    
    switch (action) {
      case 'approve':
        return this.handleApprove(instance, flow)
      case 'reject':
        return this.handleReject(instance)
      case 'transfer':
        return this.handleTransfer(instance, options.transferTo!)
    }
  }
  
  private async handleApprove(instance: ApprovalInstance, flow: ApprovalFlow) {
    const currentNode = flow.nodes.find(n => n.id === instance.currentNode)
    
    // 会签需要所有人都同意
    if (currentNode!.type === 'all') {
      const approvals = instance.history.filter(
        h => h.nodeId === currentNode!.id && h.action === 'approve'
      )
      const approvers = this.getAssignees(currentNode!, instance.context)
      if (approvals.length < approvers.length) {
        return instance  // 等待其他人审批
      }
    }
    
    // 找下一个节点
    const nextNode = this.findNextNode(flow, instance)
    
    if (nextNode === 'end') {
      instance.status = 'approved'
      await this.onComplete(instance, true)
    } else {
      instance.currentNode = nextNode
      await this.notifyApprovers(instance, flow.nodes.find(n => n.id === nextNode)!)
    }
    
    return instance
  }
  
  private async handleReject(instance: ApprovalInstance) {
    instance.status = 'rejected'
    await this.onComplete(instance, false)
    return instance
  }
  
  private async handleTransfer(instance: ApprovalInstance, transferTo: string) {
    // 转交给其他人
    await this.notifyApprovers(instance, { id: 'transferred', assignee: transferTo })
    return instance
  }
  
  private findNextNode(flow: ApprovalFlow, instance: ApprovalInstance): string {
    const edges = flow.edges.filter(e => e.from === instance.currentNode)
    
    for (const edge of edges) {
      if (!edge.condition || edge.condition(instance.context)) {
        return edge.to
      }
    }
    
    return 'end'
  }
  
  private getAssignees(node: ApprovalNode, context: ApprovalContext): string[] {
    if (typeof node.assignee === 'function') {
      return node.assignee(context)
    } else if (Array.isArray(node.assignee)) {
      return node.assignee
    } else {
      return [node.assignee]
    }
  }
  
  private async notifyApprovers(instance: ApprovalInstance, node: ApprovalNode) {
    const approvers = this.getAssignees(node, instance.context)
    // 发送通知...
  }
  
  private async onComplete(instance: ApprovalInstance, approved: boolean) {
    // 回调业务系统
  }
  
  // 撤回
  async withdraw(instanceId: string, operator: string): Promise<boolean> {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.status !== 'pending') return false
    
    // 检查是否可以撤回（发起人且第一个节点未审批完）
    if (instance.history.length === 0 || 
        instance.history.every(h => h.approver !== operator)) {
      instance.status = 'cancelled'
      return true
    }
    
    return false
  }
  
  // 查询待办
  getPendingTasks(userId: string): ApprovalInstance[] {
    return Array.from(this.instances.values())
      .filter(inst => {
        const flow = this.flows.get(inst.flowId)
        const node = flow?.nodes.find(n => n.id === inst.currentNode)
        if (!node) return false
        
        const assignees = this.getAssignees(node, inst.context)
        return assignees.includes(userId)
      })
  }
}

// ==================== React Hook ====================
function useApproval() {
  const engine = useRef<ApprovalEngine>()
  
  useEffect(() => {
    engine.current = new ApprovalEngine()
    engine.current.register(leaveApprovalFlow)
    engine.current.register(expenseApprovalFlow)
  }, [])
  
  const startApproval = useCallback(async (flowId: string, data: any) => {
    const context = {
      applicant: currentUser,
      data,
      submittedAt: Date.now()
    }
    return engine.current?.start(flowId, generateId(), context)
  }, [])
  
  const approve = useCallback(async (instanceId: string, action: 'approve' | 'reject', comment?: string) => {
    return engine.current?.approve(instanceId, action, {
      approver: currentUser.id,
      comment
    })
  }, [])
  
  const getMyPendingTasks = useCallback(() => {
    return engine.current?.getPendingTasks(currentUser.id) || []
  }, [])
  
  return { startApproval, approve, getMyPendingTasks }
}

// ==================== 组件 ====================
function ApprovalList() {
  const { getMyPendingTasks } = useApproval()
  const [tasks, setTasks] = useState<ApprovalInstance[]>([])
  
  useEffect(() => {
    setTasks(getMyPendingTasks())
  }, [])
  
  return (
    <div className="approval-list">
      {tasks.map(task => (
        <ApprovalCard key={task.id} instance={task} />
      ))}
    </div>
  )
}

function ApprovalCard({ instance }: { instance: ApprovalInstance }) {
  const { approve } = useApproval()
  
  const handleApprove = async () => {
    await approve(instance.id, 'approve', '同意')
  }
  
  const handleReject = async () => {
    await approve(instance.id, 'reject', '不同意')
  }
  
  return (
    <div className="card">
      <div className="title">{instance.businessId}</div>
      <div className="history">
        {instance.history.map((record, i) => (
          <div key={i} className="record">
            <span>{record.approver}</span>
            <span>{record.action}</span>
            <span>{record.comment}</span>
          </div>
        ))}
      </div>
      <div className="actions">
        <button onClick={handleApprove}>同意</button>
        <button onClick={handleReject}>拒绝</button>
      </div>
    </div>
  )
}

// 🎯 核心价值：
// 1. 审批流配置化，不改代码
// 2. 支持多级、会签、条件分支
// 3. 完整的审批历史
// 4. 支持撤回、转交
// 5. 状态机保证流程正确`,
    designPattern: '工作流引擎 + 状态机 + 责任链'
  },
  {
    id: 'report',
    title: '大数据量报表',
    subtitle: '前端性能与内存优化',
    difficulty: 5,
    tags: ['虚拟滚动', '内存优化', '懒加载'],
    category: '企业应用',
    problem: `大数据报表是企业应用最头疼的场景：

**实际场景：**

1. **财务报表** - 几十万行交易记录
2. **销售明细** - 全年销售数据
3. **库存清单** - 全仓库SKU列表
4. **日志查询** - 百万级操作日志
5. **用户列表** - 全平台用户导出

**核心挑战：**

1. **渲染性能** - 几万行数据渲染卡死
2. **内存占用** - 数据量太大浏览器崩溃
3. **计算性能** - 汇总统计计算慢
4. **导出功能** - 前端导出大文件
5. **筛选排序** - 前端处理还是后端？

典型烂代码特征：
- 直接渲染所有数据
- 计算同步执行阻塞UI
- 内存不释放`,
    badCode: `// ❌ 典型屎山报表

function ReportPage() {
  const [data, setData] = useState([])
  
  useEffect(() => {
    // 一次性加载所有数据
    fetch('/api/report').then(r => r.json()).then(setData)
  }, [])
  
  // 前端计算汇总（阻塞UI）
  const total = data.reduce((sum, item) => sum + item.amount, 0)
  const avg = total / data.length
  
  // 直接渲染（卡死）
  return (
    <table>
      <tbody>
        {data.map(item => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td>{item.amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}`,
    goodCode: `// ✅ 优雅设计：大数据报表方案

// ==================== 数据分片加载 ====================
interface DataChunk {
  data: any[]
  offset: number
  total: number
  hasMore: boolean
}

class LazyDataSource {
  private cache = new Map<number, any[]>()
  private chunkSize = 1000
  private total = 0
  
  // 分片加载
  async loadChunk(offset: number): Promise<DataChunk> {
    // 检查缓存
    if (this.cache.has(offset)) {
      return {
        data: this.cache.get(offset)!,
        offset,
        total: this.total,
        hasMore: offset + this.chunkSize < this.total
      }
    }
    
    // 请求服务端
    const response = await fetch(\`/api/report?offset=\${offset}&limit=\${this.chunkSize}\`)
    const result = await response.json()
    
    this.total = result.total
    this.cache.set(offset, result.data)
    
    return {
      data: result.data,
      offset,
      total: result.total,
      hasMore: result.hasMore
    }
  }
  
  // 预加载相邻分片
  prefetch(offset: number) {
    const nextOffset = offset + this.chunkSize
    if (!this.cache.has(nextOffset)) {
      this.loadChunk(nextOffset)
    }
  }
  
  // 清理缓存（内存优化）
  clearOldChunks(currentOffset: number) {
    const keepRange = this.chunkSize * 3  // 保留前后3个分片
    for (const [offset] of this.cache) {
      if (Math.abs(offset - currentOffset) > keepRange) {
        this.cache.delete(offset)
      }
    }
  }
}

// ==================== 虚拟表格 ====================
function VirtualTable({ dataSource }: { dataSource: LazyDataSource }) {
  const [visibleData, setVisibleData] = useState<any[]>([])
  const [scrollTop, setScrollTop] = useState(0)
  const [total, setTotal] = useState(0)
  
  const rowHeight = 40
  const containerHeight = 600
  const visibleCount = Math.ceil(containerHeight / rowHeight) + 5
  const startIndex = Math.floor(scrollTop / rowHeight)
  
  // 加载可见区域数据
  useEffect(() => {
    const loadVisible = async () => {
      const chunkOffset = Math.floor(startIndex / 1000) * 1000
      const chunk = await dataSource.loadChunk(chunkOffset)
      
      setTotal(chunk.total)
      
      // 从分片中提取可见部分
      const localIndex = startIndex - chunkOffset
      const data = chunk.data.slice(
        Math.max(0, localIndex - 5),
        localIndex + visibleCount
      )
      
      setVisibleData(data)
      
      // 预加载
      dataSource.prefetch(chunkOffset)
      
      // 清理旧数据
      dataSource.clearOldChunks(chunkOffset)
    }
    
    loadVisible()
  }, [startIndex, dataSource])
  
  const totalHeight = total * rowHeight
  const offsetY = startIndex * rowHeight
  
  return (
    <div 
      className="table-container"
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, width: '100%' }}>
          {visibleData.map((row, i) => (
            <div key={startIndex + i} style={{ height: rowHeight }}>
              {/* 渲染行 */}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ==================== 后台计算 ====================
class BackgroundCalculator {
  private worker: Worker
  
  constructor() {
    // 创建 Web Worker
    const blob = new Blob([\`
      self.onmessage = function(e) {
        const { type, data } = e.data
        
        switch (type) {
          case 'sum':
            const result = data.reduce((sum, item) => sum + item.value, 0)
            self.postMessage({ type: 'sum', result })
            break
          
          case 'groupBy':
            const groups = {}
            for (const item of data) {
              const key = item.category
              groups[key] = (groups[key] || 0) + item.value
            }
            self.postMessage({ type: 'groupBy', result: groups })
            break
        }
      }
    \`], { type: 'application/javascript' })
    
    this.worker = new Worker(URL.createObjectURL(blob))
  }
  
  // 异步计算
  calculate(type: string, data: any[]): Promise<any> {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === type) {
          this.worker.removeEventListener('message', handler)
          resolve(e.data.result)
        }
      }
      this.worker.addEventListener('message', handler)
      this.worker.postMessage({ type, data })
    })
  }
  
  terminate() {
    this.worker.terminate()
  }
}

// ==================== 流式导出 ====================
class StreamingExporter {
  // 流式导出 CSV（不占内存）
  async exportToCSV(fetchChunk: (offset: number) => Promise<any[]>, total: number) {
    const chunkSize = 1000
    const chunks = Math.ceil(total / chunkSize)
    
    // 创建可写流
    const stream = new WritableStream({
      write(chunk) {
        // 写入文件
        console.log('Writing chunk:', chunk)
      }
    })
    
    // 流式处理
    for (let i = 0; i < chunks; i++) {
      const data = await fetchChunk(i * chunkSize)
      const csv = this.toCSV(data)
      // 写入流
      await stream.getWriter().write(csv)
      
      // 更新进度
      this.updateProgress((i + 1) / chunks * 100)
    }
    
    stream.getWriter().close()
  }
  
  private toCSV(data: any[]): string {
    // 转换为CSV格式
    return data.map(row => Object.values(row).join(',')).join('\\n')
  }
  
  private updateProgress(percent: number) {
    // 更新导出进度
  }
}

// ==================== React Hook ====================
function useBigReport() {
  const dataSource = useRef(new LazyDataSource())
  const calculator = useRef(new BackgroundCalculator())
  const exporter = useRef(new StreamingExporter())
  
  useEffect(() => {
    return () => {
      calculator.current.terminate()
    }
  }, [])
  
  const loadData = useCallback(async (offset: number) => {
    return dataSource.current.loadChunk(offset)
  }, [])
  
  const calculate = useCallback(async (type: string, data: any[]) => {
    return calculator.current.calculate(type, data)
  }, [])
  
  const exportCSV = useCallback(async () => {
    const firstChunk = await dataSource.current.loadChunk(0)
    await exporter.current.exportToCSV(
      (offset) => dataSource.current.loadChunk(offset).then(c => c.data),
      firstChunk.total
    )
  }, [])
  
  return { loadData, calculate, exportCSV }
}

// ==================== 组件 ====================
function ReportPage() {
  const { loadData, calculate, exportCSV } = useBigReport()
  const [summary, setSummary] = useState({ total: 0, avg: 0 })
  const [exportProgress, setExportProgress] = useState(0)
  
  // 加载汇总数据（服务端计算）
  useEffect(() => {
    fetch('/api/report/summary')
      .then(r => r.json())
      .then(setSummary)
  }, [])
  
  return (
    <div className="report-page">
      {/* 汇总卡片 */}
      <div className="summary-cards">
        <Card title="总计" value={summary.total} />
        <Card title="平均" value={summary.avg} />
      </div>
      
      {/* 虚拟表格 */}
      <VirtualTable dataSource={dataSource} />
      
      {/* 导出 */}
      <div className="export-section">
        <button onClick={exportCSV}>
          {exportProgress > 0 ? \`导出中 \${exportProgress}%\` : '导出CSV'}
        </button>
      </div>
    </div>
  )
}

// 🎯 核心价值：
// 1. 分片加载，内存可控
// 2. 虚拟滚动，渲染流畅
// 3. Worker计算，UI不阻塞
// 4. 流式导出，不占内存
// 5. 预加载+缓存，体验丝滑`,
    designPattern: '分片加载 + 虚拟滚动 + Worker计算'
  },
  {
    id: 'scheduler',
    title: '任务调度器',
    subtitle: '定时任务与队列管理',
    difficulty: 4,
    tags: ['任务队列', '定时器', '优先级'],
    category: '架构模式',
    problem: `前端也需要任务调度：

**实际场景：**

1. **自动保存** - 停止输入后2秒保存
2. **批量操作** - 100个请求分批处理
3. **定时刷新** - 每30秒检查新消息
4. **延迟执行** - 3秒后显示引导
5. **重试策略** - 失败后指数退避重试

**核心挑战：**

1. **任务优先级** - 重要任务优先执行
2. **并发控制** - 同时最多N个任务
3. **失败重试** - 自动重试机制
4. **任务取消** - 取消未执行的任务
5. **任务依赖** - A完成后执行B

典型烂代码特征：
- setTimeout 满天飞
- 没有取消机制
- 重试逻辑重复写`,
    badCode: `// ❌ 典型屎山：setTimeout 满天飞

function Editor() {
  // 到处是 setTimeout
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft()
    }, 2000)
    return () => clearTimeout(timer)
  }, [content])
  
  // 重试逻辑重复
  const fetchWithRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn()
      } catch (e) {
        if (i === retries - 1) throw e
        await new Promise(r => setTimeout(r, 1000 * i))
      }
    }
  }
  
  // 问题：
  // 1. 没法取消任务
  // 2. 没法控制并发
  // 3. 页面关闭任务还在跑
}`,
    goodCode: `// ✅ 优雅设计：任务调度器

// ==================== 任务定义 ====================
interface Task<T = any> {
  id: string
  name: string
  priority: number  // 越小越优先
  execute: () => T | Promise<T>
  onSuccess?: (result: T) => void
  onError?: (error: Error) => void
  retry?: {
    count: number
    delay: number | ((attempt: number) => number)
  }
  timeout?: number
  dedupe?: string  // 去重key
}

// ==================== 任务调度器 ====================
class TaskScheduler {
  private queue: Task[] = []
  private running = new Map<string, Promise<any>>()
  private timers = new Map<string, NodeJS.Timeout>()
  private maxConcurrent = 4
  private paused = false
  
  // 添加任务
  schedule<T>(task: Task<T>): string {
    // 去重检查
    if (task.dedupe) {
      this.cancelByDedupe(task.dedupe)
    }
    
    // 按优先级插入
    const index = this.queue.findIndex(t => t.priority > task.priority)
    if (index === -1) {
      this.queue.push(task)
    } else {
      this.queue.splice(index, 0, task)
    }
    
    // 尝试执行
    this.tryExecute()
    
    return task.id
  }
  
  // 延迟任务
  scheduleDelayed<T>(task: Task<T>, delay: number): string {
    const timer = setTimeout(() => {
      this.timers.delete(task.id)
      this.schedule(task)
    }, delay)
    
    this.timers.set(task.id, timer)
    return task.id
  }
  
  // 周期任务
  scheduleRecurring<T>(
    task: Task<T>,
    interval: number,
    options?: { immediate?: boolean }
  ): string {
    const run = async () => {
      await this.executeTask(task)
    }
    
    if (options?.immediate) {
      run()
    }
    
    const timer = setInterval(run, interval)
    this.timers.set(task.id, timer)
    
    return task.id
  }
  
  // 批量任务
  async scheduleBatch<T>(
    items: T[],
    handler: (item: T) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<void> {
    const concurrency = options?.concurrency || this.maxConcurrent
    
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency)
      await Promise.all(batch.map(handler))
    }
  }
  
  // 执行任务
  private async tryExecute() {
    if (this.paused) return
    if (this.running.size >= this.maxConcurrent) return
    if (this.queue.length === 0) return
    
    const task = this.queue.shift()!
    const promise = this.executeTask(task)
    this.running.set(task.id, promise)
    
    promise.finally(() => {
      this.running.delete(task.id)
      this.tryExecute()
    })
  }
  
  // 执行单个任务
  private async executeTask<T>(task: Task<T>): Promise<T> {
    let attempt = 0
    const maxAttempts = (task.retry?.count || 0) + 1
    
    while (attempt < maxAttempts) {
      try {
        // 超时处理
        const result = task.timeout
          ? await Promise.race([
              task.execute(),
              this.createTimeout(task.timeout)
            ])
          : await task.execute()
        
        task.onSuccess?.(result)
        return result
        
      } catch (error) {
        attempt++
        
        if (attempt >= maxAttempts) {
          task.onError?.(error)
          throw error
        }
        
        // 重试延迟
        const delay = typeof task.retry!.delay === 'function'
          ? task.retry!.delay(attempt)
          : task.retry!.delay || 1000
        
        await this.sleep(delay)
      }
    }
    
    throw new Error('Task failed')
  }
  
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), ms)
    })
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  // 取消任务
  cancel(taskId: string): boolean {
    // 从队列移除
    const queueIndex = this.queue.findIndex(t => t.id === taskId)
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1)
      return true
    }
    
    // 取消定时器
    const timer = this.timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(taskId)
      return true
    }
    
    return false
  }
  
  // 按去重key取消
  cancelByDedupe(dedupe: string): void {
    // 取消队列中的
    this.queue = this.queue.filter(t => t.dedupe !== dedupe)
    
    // 取消定时器中的
    for (const [id, timer] of this.timers) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
  }
  
  // 暂停/恢复
  pause() { this.paused = true }
  resume() { this.paused = false; this.tryExecute() }
  
  // 清空
  clear() {
    this.queue = []
    this.timers.forEach(t => clearTimeout(t))
    this.timers.clear()
  }
  
  // 状态
  getStatus() {
    return {
      pending: this.queue.length,
      running: this.running.size,
      timers: this.timers.size
    }
  }
}

// ==================== React Hook ====================
function useTaskScheduler() {
  const scheduler = useRef<TaskScheduler>()
  
  useEffect(() => {
    scheduler.current = new TaskScheduler()
    return () => scheduler.current?.clear()
  }, [])
  
  const schedule = useCallback((task: Omit<Task, 'id'>) => {
    return scheduler.current?.schedule({ ...task, id: generateId() })
  }, [])
  
  const scheduleDelayed = useCallback((task: Omit<Task, 'id'>, delay: number) => {
    return scheduler.current?.scheduleDelayed({ ...task, id: generateId() }, delay)
  }, [])
  
  const scheduleRecurring = useCallback((task: Omit<Task, 'id'>, interval: number) => {
    return scheduler.current?.scheduleRecurring({ ...task, id: generateId() }, interval)
  }, [])
  
  const cancel = useCallback((taskId: string) => {
    scheduler.current?.cancel(taskId)
  }, [])
  
  return { schedule, scheduleDelayed, scheduleRecurring, cancel }
}

// ==================== 使用示例 ====================

// 自动保存
function useAutoSave(content: string) {
  const { scheduleDelayed, cancel } = useTaskScheduler()
  const saveTaskId = useRef<string>()
  
  useEffect(() => {
    // 取消之前的保存任务
    if (saveTaskId.current) {
      cancel(saveTaskId.current)
    }
    
    // 2秒后保存
    saveTaskId.current = scheduleDelayed({
      name: 'auto-save',
      priority: 10,
      dedupe: 'auto-save',
      execute: () => saveContent(content),
      onSuccess: () => console.log('Saved'),
      retry: { count: 3, delay: (n) => 1000 * Math.pow(2, n) }
    }, 2000)
  }, [content])
}

// 批量请求
function useBatchRequest() {
  const scheduler = useRef<TaskScheduler>()
  
  const batchFetch = async (urls: string[]) => {
    const results: any[] = []
    
    await scheduler.current?.scheduleBatch(
      urls,
      async (url) => {
        const response = await fetch(url)
        results.push(await response.json())
      },
      { concurrency: 4 }
    )
    
    return results
  }
  
  return { batchFetch }
}

// 定时刷新
function usePeriodicRefresh(fetchFn: () => Promise<void>, interval: number) {
  const { scheduleRecurring, cancel } = useTaskScheduler()
  
  useEffect(() => {
    const taskId = scheduleRecurring({
      name: 'periodic-refresh',
      priority: 100,
      execute: fetchFn,
      onError: (e) => console.error('Refresh failed:', e)
    }, interval)
    
    return () => cancel(taskId!)
  }, [interval])
}

// 带重试的请求
function useRetryableRequest() {
  const { schedule } = useTaskScheduler()
  
  const fetchWithRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      schedule({
        name: 'retryable-request',
        priority: 50,
        execute: fn,
        onSuccess: resolve,
        onError: reject,
        retry: {
          count: 3,
          delay: (attempt) => 1000 * Math.pow(2, attempt)  // 指数退避
        }
      })
    })
  }
  
  return { fetchWithRetry }
}

// 🎯 核心价值：
// 1. 统一管理所有异步任务
// 2. 支持优先级、并发控制
// 3. 自动重试、超时处理
// 4. 任务可取消
// 5. 支持定时、周期、延迟`,
    designPattern: '任务队列 + 调度器模式 + 重试策略'
  },
  // ==================== 电商核心场景 ====================
  {
    id: 'sku-selector',
    title: 'SKU组合选择器',
    subtitle: '多维度属性组合与库存计算',
    difficulty: 5,
    tags: ['笛卡尔积', '图论', '状态机'],
    category: '电商领域',
    problem: `这是电商最经典的复杂场景之一，看似简单的"选择商品规格"，背后涉及：

**场景特征（看到这些就该想到用图论/状态机）：**

1. **多维度属性组合** - 颜色 × 尺寸 × 版本 = 笛卡尔积爆炸
2. **库存关联** - 每个组合对应不同库存、价格
3. **可选路径动态变化** - 选了红色后，哪些尺寸还有货？
4. **缺货提示** - 某些组合无货，要禁用并提示
5. **推荐逻辑** - 缺货时推荐相似商品

**典型烂代码特征：**

- 用大量 if-else 判断各种组合
- 每次选择都重新计算所有可能性
- 库存状态散落各处，难以维护
- 无法处理"部分可选"状态

**为什么容易屎山？**

- N个属性，每个M个值，组合数 = M^N
- 状态之间相互影响，牵一发动全身
- 边界条件多：缺货、预售、限购、地区限制...`,
    badCode: `// ❌ 典型屎山：大量 if-else 判断，状态混乱
function ProductPage({ product }) {
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const [version, setVersion] = useState('')
  
  // 问题1: 每个属性都要写一堆判断
  const isColorDisabled = (c) => {
    if (size === 'S' && c === 'red') return true  // S码红色无货
    if (size === 'M' && c === 'blue') return true  // M码蓝色无货
    if (version === 'pro' && c === 'green') return true  // pro版无绿色
    // ... 100行 if-else
    return false
  }
  
  const isSizeDisabled = (s) => {
    if (color === 'red' && s === 'S') return true
    if (color === 'blue' && s === 'M') return true
    // ... 又是100行
    return false
  }
  
  // 问题2: 获取当前SKU逻辑复杂
  const getCurrentSku = () => {
    // 遍历所有SKU找到匹配的
    for (const sku of product.skus) {
      if (sku.color === color && sku.size === size && sku.version === version) {
        return sku
      }
    }
    return null
  }
  
  // 问题3: 价格计算散落各处
  const getPrice = () => {
    const sku = getCurrentSku()
    if (!sku) return product.minPrice + '-' + product.maxPrice
    if (color === 'red') return sku.price + 100  // 红色加价
    if (version === 'pro') return sku.price + 500  // pro版加价
    return sku.price
  }
  
  // 问题4: 每次选择都要重新计算所有状态
  // 问题5: 无法处理"部分可选"（如某组合仅部分城市有货）
  // 问题6: 库存变化时，整块逻辑要重写
  
  return (
    <div>
      {/* 颜色选择 */}
      <div>
        {colors.map(c => (
          <button 
            key={c} 
            disabled={isColorDisabled(c)}
            onClick={() => setColor(c)}
            className={color === c ? 'active' : ''}
          >
            {c}
          </button>
        ))}
      </div>
      {/* 尺寸选择 - 又是重复逻辑 */}
      {/* 版本选择 - 又是重复逻辑 */}
    </div>
  )
}

// 问题：
// 1. 新增属性（如"材质"）要改 N 处
// 2. 属性越多，if-else 指数增长
// 3. 无法复用，每个商品页面都要写一遍
// 4. 库存实时变化时，逻辑不清晰`,
    goodCode: `// ✅ 优雅设计：SKU矩阵 + 状态机 + 规则引擎

// ==================== 核心数据结构 ====================

// SKU规格定义
interface SpecDef {
  id: string
  name: string        // 如"颜色"
  values: SpecValue[]
}

interface SpecValue {
  id: string
  name: string        // 如"红色"
  imageUrl?: string   // 颜色色块/图片
}

// SKU组合
interface Sku {
  id: string
  specCombo: Map<string, string>  // specId -> valueId
  price: number
  originalPrice?: number
  stock: number
  lockedStock: number    // 预占库存
  status: 'normal' | 'presell' | 'out_of_stock'
  presellDate?: Date     // 预售发货时间
}

// ==================== SKU选择器核心 ====================

class SkuSelector {
  private specs: SpecDef[]
  private skus: Sku[]
  private selected: Map<string, string> = new Map()  // 当前选择
  
  constructor(specs: SpecDef[], skus: Sku[]) {
    this.specs = specs
    this.skus = skus
  }
  
  // 选择某个属性值
  select(specId: string, valueId: string): SelectionResult {
    this.selected.set(specId, valueId)
    return this.computeState()
  }
  
  // 取消选择
  deselect(specId: string): SelectionResult {
    this.selected.delete(specId)
    return this.computeState()
  }
  
  // 核心算法：计算当前状态
  private computeState(): SelectionResult {
    // 1. 找出所有可能的SKU路径
    const possibleSkus = this.getPossibleSkus()
    
    // 2. 构建可选状态矩阵
    const specStates = this.buildSpecStates(possibleSkus)
    
    // 3. 判断是否完成选择
    const isComplete = this.selected.size === this.specs.length
    const currentSku = isComplete ? this.findExactSku() : null
    
    return {
      selected: new Map(this.selected),
      specStates,           // 每个属性值的状态
      possibleSkus,         // 当前可选的SKU列表
      currentSku,           // 精确匹配的SKU（如果选完）
      isComplete,           // 是否完成选择
      priceRange: this.getPriceRange(possibleSkus),  // 价格区间
      stockInfo: this.getStockInfo(possibleSkus),    // 库存汇总
    }
  }
  
  // 获取可能的SKU（路径搜索）
  private getPossibleSkus(): Sku[] {
    return this.skus.filter(sku => {
      // 已选择的属性必须匹配
      for (const [specId, valueId] of this.selected) {
        if (sku.specCombo.get(specId) !== valueId) {
          return false
        }
      }
      return true
    })
  }
  
  // 构建属性状态矩阵（核心！）
  private buildSpecStates(possibleSkus: Sku[]): Map<string, Map<string, SpecState>> {
    const states = new Map<string, Map<string, SpecState>>()
    
    for (const spec of this.specs) {
      const valueStates = new Map<string, SpecState>()
      
      for (const value of spec.values) {
        // 模拟选择这个值，看有多少SKU可选
        const testSelected = new Map(this.selected)
        testSelected.set(spec.id, value.id)
        
        const matchedSkus = this.skus.filter(sku => {
          for (const [sId, vId] of testSelected) {
            if (sku.specCombo.get(sId) !== vId) return false
          }
          return true
        })
        
        const isSelected = this.selected.get(spec.id) === value.id
        const hasStock = matchedSkus.some(s => s.stock > s.lockedStock)
        const isDisabled = matchedSkus.length === 0 || !hasStock
        
        valueStates.set(value.id, {
          value,
          isSelected,
          isDisabled,
          disabledReason: this.getDisabledReason(matchedSkus, hasStock),
          availableStock: matchedSkus.reduce((sum, s) => sum + Math.max(0, s.stock - s.lockedStock), 0),
          priceImpact: this.getPriceImpact(spec.id, value.id, matchedSkus),
        })
      }
      
      states.set(spec.id, valueStates)
    }
    
    return states
  }
  
  private getDisabledReason(skus: Sku[], hasStock: boolean): string | null {
    if (skus.length === 0) return '该组合不存在'
    if (!hasStock) return '暂时缺货'
    return null
  }
  
  private getPriceImpact(specId: string, valueId: string, skus: Sku[]): number | null {
    // 计算选择此值的价格影响
    if (skus.length === 0) return null
    
    const basePrice = Math.min(...this.skus.map(s => s.price))
    const minPriceWithThis = Math.min(...skus.map(s => s.price))
    return minPriceWithThis - basePrice
  }
  
  private findExactSku(): Sku | null {
    return this.skus.find(sku => {
      for (const [specId, valueId] of this.selected) {
        if (sku.specCombo.get(specId) !== valueId) return false
      }
      return sku.specCombo.size === this.selected.size
    }) || null
  }
  
  private getPriceRange(skus: Sku[]): { min: number; max: number } {
    const prices = skus.map(s => s.price)
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    }
  }
  
  private getStockInfo(skus: Sku[]): StockInfo {
    const totalStock = skus.reduce((sum, s) => sum + s.stock, 0)
    const availableStock = skus.reduce((sum, s) => sum + Math.max(0, s.stock - s.lockedStock), 0)
    const hasPresell = skus.some(s => s.status === 'presell')
    
    return { totalStock, availableStock, hasPresell }
  }
}

// ==================== 属性状态 ====================

interface SpecState {
  value: SpecValue
  isSelected: boolean
  isDisabled: boolean
  disabledReason: string | null
  availableStock: number
  priceImpact: number | null  // 相比基础价的差异
}

interface SelectionResult {
  selected: Map<string, string>
  specStates: Map<string, Map<string, SpecState>>
  possibleSkus: Sku[]
  currentSku: Sku | null
  isComplete: boolean
  priceRange: { min: number; max: number }
  stockInfo: StockInfo
}

interface StockInfo {
  totalStock: number
  availableStock: number
  hasPresell: boolean
}

// ==================== React Hook ====================

function useSkuSelector(specs: SpecDef[], skus: Sku[]) {
  const selectorRef = useRef(new SkuSelector(specs, skus))
  const [result, setResult] = useState<SelectionResult>(() => 
    selectorRef.current.select('', '')
  )
  
  const select = useCallback((specId: string, valueId: string) => {
    const result = selectorRef.current.select(specId, valueId)
    setResult(result)
  }, [])
  
  const deselect = useCallback((specId: string) => {
    const result = selectorRef.current.deselect(specId)
    setResult(result)
  }, [])
  
  return { ...result, select, deselect }
}

// ==================== 组件使用 ====================

function SkuSelectorComponent({ product }: { product: Product }) {
  const { specs, skus, selected, specStates, currentSku, isComplete, priceRange, stockInfo, select, deselect } = 
    useSkuSelector(product.specs, product.skus)
  
  return (
    <div className="space-y-4">
      {/* 价格和库存信息 */}
      <div className="flex justify-between items-center">
        <div className="text-2xl font-bold text-red-500">
          {isComplete 
            ? \`¥\${currentSku!.price}\`
            : \`¥\${priceRange.min} - ¥\${priceRange.max}\`
          }
        </div>
        <div className="text-sm text-gray-500">
          {isComplete 
            ? \`库存: \${currentSku!.stock - currentSku!.lockedStock}件\`
            : \`总库存: \${stockInfo.availableStock}件\`
          }
        </div>
      </div>
      
      {/* 规格选择 */}
      {specs.map(spec => {
        const valueStates = specStates.get(spec.id)
        if (!valueStates) return null
        
        return (
          <div key={spec.id} className="space-y-2">
            <div className="text-sm font-medium">{spec.name}</div>
            <div className="flex flex-wrap gap-2">
              {spec.values.map(value => {
                const state = valueStates.get(value.id)!
                return (
                  <button
                    key={value.id}
                    onClick={() => state.isSelected 
                      ? deselect(spec.id) 
                      : select(spec.id, value.id)
                    }
                    disabled={state.isDisabled}
                    className={\`
                      px-4 py-2 rounded border transition-all
                      \${state.isSelected 
                        ? 'border-blue-500 bg-blue-50 text-blue-600' 
                        : state.isDisabled
                          ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                          : 'border-gray-300 hover:border-blue-300'
                      }
                    \`}
                  >
                    {value.name}
                    {state.priceImpact !== null && state.priceImpact > 0 && (
                      <span className="text-xs text-red-400 ml-1">
                        +¥{state.priceImpact}
                      </span>
                    )}
                    {state.isDisabled && (
                      <span className="text-xs block">{state.disabledReason}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      
      {/* 加入购物车按钮 */}
      <button 
        disabled={!isComplete || !currentSku || currentSku.stock <= currentSku.lockedStock}
        className="w-full py-3 bg-red-500 text-white rounded-lg disabled:bg-gray-300"
      >
        {!isComplete ? '请选择规格' 
          : currentSku!.stock <= currentSku!.lockedStock ? '暂时缺货'
          : '加入购物车'
        }
      </button>
    </div>
  )
}

// 🎯 核心价值：
// 1. O(1)时间判断属性可选状态
// 2. 新增属性只需加配置，无需改代码
// 3. 库存变化自动响应
// 4. 支持预售、缺货等复杂状态
// 5. 价格影响实时计算`,
    designPattern: '图论路径搜索 + 状态机 + 规则引擎'
  },
  {
    id: 'coupon-stack',
    title: '优惠券叠加计算',
    subtitle: '多种优惠叠加互斥规则引擎',
    difficulty: 5,
    tags: ['策略模式', '责任链', '规则引擎'],
    category: '电商领域',
    problem: `优惠券叠加计算是电商最复杂的业务逻辑之一：

**场景特征（看到这些就该想到规则引擎）：**

1. **多种优惠类型** - 满减、折扣、无门槛、店铺券、平台券...
2. **互斥规则** - A券和B券不能同时用
3. **叠加规则** - 店铺券可叠加平台券
4. **最优计算** - 多张券如何组合最划算？
5. **边界情况** - 部分商品不参与、最高优惠金额...

**典型烂代码特征：**

- if-else 嵌套地狱
- 优惠计算逻辑散落各处
- 新增优惠类型要改 N 处
- 无法处理复杂的互斥/叠加规则`,
    badCode: `// ❌ 典型屎山：if-else 地狱
function calculatePrice(order, coupons) {
  let price = order.totalPrice
  let discount = 0
  
  const usedCoupons = []
  
  // 问题1: 大量 if-else 判断券的类型
  for (const coupon of coupons) {
    if (coupon.type === 'full_reduction') {
      // 满减券
      if (price >= coupon.threshold) {
        if (coupon.isPlatform) {
          // 平台满减
          if (!usedCoupons.find(c => c.type === 'full_reduction' && c.isPlatform)) {
            discount += coupon.discount
            usedCoupons.push(coupon)
          }
        } else {
          // 店铺满减
          if (!usedCoupons.find(c => c.type === 'full_reduction' && !c.isPlatform)) {
            discount += coupon.discount
            usedCoupons.push(coupon)
          }
        }
      }
    } else if (coupon.type === 'discount') {
      // 折扣券
      if (!usedCoupons.find(c => c.type === 'discount')) {
        const d = price * (1 - coupon.discount)
        if (coupon.maxDiscount && d > coupon.maxDiscount) {
          discount += coupon.maxDiscount
        } else {
          discount += d
        }
        usedCoupons.push(coupon)
      }
    } else if (coupon.type === 'no_threshold') {
      // 无门槛
      if (!usedCoupons.find(c => c.type === 'no_threshold')) {
        discount += coupon.discount
        usedCoupons.push(coupon)
      }
    }
    // ... 还有10种券类型
    
    // 问题2: 互斥规则写死在代码里
    // 问题3: 叠加规则难以维护
    // 问题4: 新增券类型要改这里
  }
  
  // 问题5: 优惠上限判断
  if (discount > price * 0.5) {
    discount = price * 0.5  // 最多优惠50%
  }
  
  return {
    originalPrice: order.totalPrice,
    discount,
    finalPrice: price - discount,
    usedCoupons
  }
}

// 问题：
// 1. 100种券组合就要写100个分支
// 2. 互斥规则变化要改代码
// 3. 无法处理"部分商品不参与"场景
// 4. 无法自动计算最优组合`,
    goodCode: `// ✅ 优雅设计：规则引擎 + 责任链 + 策略模式

// ==================== 优惠券模型 ====================

interface Coupon {
  id: string
  type: CouponType
  name: string
  discount: number          // 优惠金额或折扣率
  threshold?: number        // 门槛金额
  maxDiscount?: number      // 最高优惠
  scope: CouponScope        // 适用范围
  stackGroup?: string       // 叠加分组（同组互斥）
  priority: number          // 优先级
  items?: string[]          // 限定商品
  excludeItems?: string[]   // 排除商品
}

type CouponType = 'full_reduction' | 'discount' | 'no_threshold' | 'shipping' | 'vip'
type CouponScope = 'platform' | 'shop' | 'category' | 'item'

// ==================== 规则定义 ====================

interface Rule {
  id: string
  type: 'mutex' | 'stack' | 'limit' | 'condition'
  couponTypes?: CouponType[]
  couponIds?: string[]
  maxDiscount?: number
  condition?: (context: PriceContext) => boolean
}

// ==================== 价格计算上下文 ====================

interface PriceContext {
  order: Order
  items: OrderItem[]
  availableCoupons: Coupon[]
  selectedCoupons: Coupon[]
  
  // 计算中间结果
  itemPrices: Map<string, number>      // 商品分摊价格
  appliedDiscounts: DiscountRecord[]   // 已应用的优惠
  currentPrice: number                 // 当前价格
}

interface DiscountRecord {
  couponId: string
  discount: number
  affectedItems: string[]
}

// ==================== 优惠计算策略 ====================

interface CouponStrategy {
  type: CouponType
  calculate(context: PriceContext, coupon: Coupon): number
  canApply(context: PriceContext, coupon: Coupon): boolean
}

// 满减策略
const FullReductionStrategy: CouponStrategy = {
  type: 'full_reduction',
  canApply(context, coupon) {
    const eligiblePrice = this.getEligiblePrice(context, coupon)
    return eligiblePrice >= (coupon.threshold || 0)
  },
  calculate(context, coupon) {
    if (!this.canApply(context, coupon)) return 0
    
    // 考虑最高优惠限制
    const discount = coupon.discount
    if (coupon.maxDiscount) {
      return Math.min(discount, coupon.maxDiscount)
    }
    return discount
  },
  getEligiblePrice(context, coupon) {
    // 计算适用商品的总价
    return context.items
      .filter(item => this.isEligible(item, coupon))
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
  },
  isEligible(item, coupon) {
    if (coupon.excludeItems?.includes(item.id)) return false
    if (coupon.items && !coupon.items.includes(item.id)) return false
    return true
  }
}

// 折扣策略
const DiscountStrategy: CouponStrategy = {
  type: 'discount',
  canApply(context, coupon) {
    return context.items.some(item => this.isEligible(item, coupon))
  },
  calculate(context, coupon) {
    const eligiblePrice = context.items
      .filter(item => this.isEligible(item, coupon))
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
    
    let discount = eligiblePrice * (1 - coupon.discount)
    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount)
    }
    return discount
  },
  isEligible(item, coupon) {
    if (coupon.excludeItems?.includes(item.id)) return false
    if (coupon.items && !coupon.items.includes(item.id)) return false
    return true
  }
}

// ==================== 规则引擎 ====================

class CouponRuleEngine {
  private strategies: Map<CouponType, CouponStrategy> = new Map()
  private rules: Rule[] = []
  
  constructor() {
    this.strategies.set('full_reduction', FullReductionStrategy)
    this.strategies.set('discount', DiscountStrategy)
    // ... 注册其他策略
  }
  
  addRule(rule: Rule) {
    this.rules.push(rule)
    return this
  }
  
  // 检查互斥规则
  checkMutex(coupons: Coupon[]): Map<string, string[]> {
    const conflicts = new Map<string, string[]>()
    
    const mutexRules = this.rules.filter(r => r.type === 'mutex')
    
    for (const rule of mutexRules) {
      const matchedCoupons = coupons.filter(c => 
        rule.couponTypes?.includes(c.type) || 
        rule.couponIds?.includes(c.id)
      )
      
      if (matchedCoupons.length > 1) {
        for (const c of matchedCoupons) {
          const others = matchedCoupons.filter(x => x.id !== c.id).map(x => x.id)
          conflicts.set(c.id, [...(conflicts.get(c.id) || []), ...others])
        }
      }
    }
    
    return conflicts
  }
  
  // 检查叠加规则
  canStack(coupon1: Coupon, coupon2: Coupon): boolean {
    // 同组互斥
    if (coupon1.stackGroup && coupon1.stackGroup === coupon2.stackGroup) {
      return false
    }
    
    // 检查规则
    const stackRules = this.rules.filter(r => r.type === 'stack')
    for (const rule of stackRules) {
      // 如果规则说这两类不能叠加
      if (rule.couponTypes?.includes(coupon1.type) && 
          rule.couponTypes?.includes(coupon2.type)) {
        return false
      }
    }
    
    return true
  }
  
  // 计算最优组合
  findBestCombination(context: PriceContext): Coupon[] {
    const availableCoupons = context.availableCoupons
    const validCombinations: { coupons: Coupon[]; discount: number }[] = []
    
    // 生成所有可能的组合（考虑互斥规则）
    this.generateCombinations(availableCoupons, [], validCombinations, context)
    
    // 找到优惠最大的组合
    const best = validCombinations.reduce((best, curr) => 
      curr.discount > best.discount ? curr : best
    , { coupons: [], discount: 0 })
    
    return best.coupons
  }
  
  private generateCombinations(
    remaining: Coupon[],
    selected: Coupon[],
    results: { coupons: Coupon[]; discount: number }[],
    context: PriceContext
  ) {
    // 计算当前选择的优惠
    const discount = this.calculateTotalDiscount(context, selected)
    results.push({ coupons: [...selected], discount })
    
    // 尝试添加更多券
    for (let i = 0; i < remaining.length; i++) {
      const coupon = remaining[i]
      
      // 检查是否可以与已选券叠加
      const canAdd = selected.every(s => this.canStack(s, coupon))
      if (!canAdd) continue
      
      // 检查是否适用
      const strategy = this.strategies.get(coupon.type)
      if (!strategy?.canApply(context, coupon)) continue
      
      // 递归
      this.generateCombinations(
        remaining.slice(i + 1),
        [...selected, coupon],
        results,
        context
      )
    }
  }
  
  // 计算总优惠
  private calculateTotalDiscount(context: PriceContext, coupons: Coupon[]): number {
    let totalDiscount = 0
    let remainingPrice = context.order.totalPrice
    
    // 按优先级排序
    const sortedCoupons = [...coupons].sort((a, b) => b.priority - a.priority)
    
    for (const coupon of sortedCoupons) {
      const strategy = this.strategies.get(coupon.type)
      if (!strategy) continue
      
      const discount = Math.min(
        strategy.calculate({ ...context, currentPrice: remainingPrice }, coupon),
        remainingPrice  // 不能超过剩余金额
      )
      
      totalDiscount += discount
      remainingPrice -= discount
    }
    
    // 检查优惠上限
    const limitRules = this.rules.filter(r => r.type === 'limit')
    for (const rule of limitRules) {
      if (rule.maxDiscount && totalDiscount > rule.maxDiscount) {
        totalDiscount = rule.maxDiscount
      }
    }
    
    return totalDiscount
  }
}

// ==================== 使用示例 ====================

const engine = new CouponRuleEngine()
  .addRule({
    id: 'platform_shop_mutex',
    type: 'mutex',
    couponTypes: ['full_reduction'],
    // 同一笔订单只能用一张满减券
  })
  .addRule({
    id: 'discount_limit',
    type: 'limit',
    maxDiscount: 500,  // 最多优惠500元
  })
  .addRule({
    id: 'platform_shop_stack',
    type: 'stack',
    couponTypes: ['full_reduction', 'discount'],  // 这些类型可叠加
  })

// React Hook
function useCouponEngine(order: Order, availableCoupons: Coupon[]) {
  const engineRef = useRef(engine)
  
  const findBest = useCallback(() => {
    const context: PriceContext = {
      order,
      items: order.items,
      availableCoupons,
      selectedCoupons: [],
      itemPrices: new Map(),
      appliedDiscounts: [],
      currentPrice: order.totalPrice,
    }
    return engineRef.current.findBestCombination(context)
  }, [order, availableCoupons])
  
  return { findBest, engine: engineRef.current }
}

// 🎯 核心价值：
// 1. 新增优惠类型只需添加策略，无需改核心代码
// 2. 互斥/叠加规则可配置
// 3. 自动计算最优组合
// 4. 支持复杂的条件判断`,
    designPattern: '策略模式 + 责任链模式 + 规则引擎'
  },
  {
    id: 'inventory-lock',
    title: '库存预占与释放',
    subtitle: '下单锁库存，超时自动释放',
    difficulty: 5,
    tags: ['状态机', '乐观锁', '补偿事务'],
    category: '电商领域',
    problem: `库存管理是电商核心，前端也需要理解：

**场景特征（看到这些就该想到状态机+补偿事务）：**

1. **下单预占** - 用户下单时锁定库存，防止超卖
2. **支付超时** - 30分钟未支付，自动释放库存
3. **并发竞争** - 多人同时抢购，如何不超卖？
4. **部分退款** - 订单部分退款，部分库存释放
5. **库存预警** - 库存不足时通知补货

**前端需要处理：**

- 实时库存显示
- 库存不足提示
- 抢购排队体验
- 库存变化动画`,
    badCode: `// ❌ 典型屎山：库存状态混乱
function ProductPage({ productId }) {
  const [stock, setStock] = useState(0)
  const [loading, setLoading] = useState(false)
  
  // 问题1: 直接显示库存，没有考虑预占
  useEffect(() => {
    fetchStock(productId).then(setStock)
  }, [productId])
  
  // 问题2: 下单时没有锁库存逻辑
  const handleBuy = async () => {
    setLoading(true)
    try {
      await createOrder({ productId, quantity: 1 })
      setStock(s => s - 1)  // 简单减1，不靠谱
      alert('下单成功')
    } catch (e) {
      // 问题3: 错误处理不完善
      if (e.message.includes('库存不足')) {
        alert('库存不足')
      }
    } finally {
      setLoading(false)
    }
  }
  
  // 问题4: 没有库存变化监听
  // 问题5: 没有排队机制
  // 问题6: 没有超时处理
  
  return (
    <div>
      <div>库存: {stock}</div>
      <button onClick={handleBuy} disabled={stock <= 0 || loading}>
        {loading ? '处理中...' : stock > 0 ? '立即购买' : '已售罄'}
      </button>
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：状态机 + 乐观锁 + 补偿事务

// ==================== 库存状态模型 ====================

interface InventoryState {
  productId: string
  totalStock: number        // 总库存
  lockedStock: number       // 预占库存
  soldStock: number         // 已售库存
  version: number           // 乐观锁版本号
  
  get availableStock(): number {
    return this.totalStock - this.lockedStock - this.soldStock
  }
}

type LockStatus = 'pending' | 'confirmed' | 'released' | 'expired'

interface StockLock {
  lockId: string
  productId: string
  quantity: number
  status: LockStatus
  createdAt: number
  expireAt: number
  orderId?: string
}

// ==================== 库存状态机 ====================

type InventoryEvent = 
  | { type: 'LOCK'; quantity: number; orderId: string }
  | { type: 'CONFIRM'; lockId: string }
  | { type: 'RELEASE'; lockId: string }
  | { type: 'EXPIRE'; lockId: string }
  | { type: 'RESTOCK'; quantity: number }

type InventoryStatus = 'available' | 'low_stock' | 'out_of_stock'

const inventoryMachine = {
  initial: 'available' as InventoryStatus,
  
  states: {
    available: {
      on: {
        LOCK: [
          { target: 'available', cond: 'hasEnoughStock' },
          { target: 'low_stock', cond: 'isLowStock' },
          { target: 'out_of_stock', cond: 'isOutOfStock' },
        ],
        RESTOCK: 'available',
      }
    },
    low_stock: {
      on: {
        LOCK: [
          { target: 'out_of_stock', cond: 'willBeOutOfStock' },
          { target: 'low_stock' },
        ],
        RESTOCK: 'available',
      },
      entry: 'notifyLowStock',
    },
    out_of_stock: {
      on: {
        RESTOCK: 'available',
      },
      entry: 'notifyOutOfStock',
    },
  },
}

// ==================== 库存服务 ====================

class InventoryService {
  private locks = new Map<string, StockLock>()
  private inventory = new Map<string, InventoryState>()
  private expireTimers = new Map<string, NodeJS.Timeout>()
  
  // 预占库存（乐观锁）
  async lockStock(productId: string, quantity: number, ttl = 1800000): Promise<StockLock> {
    const inventory = this.inventory.get(productId)
    if (!inventory) throw new Error('商品不存在')
    
    // 乐观锁检查
    if (inventory.availableStock < quantity) {
      throw new InventoryError('INSUFFICIENT_STOCK', {
        available: inventory.availableStock,
        requested: quantity,
      })
    }
    
    const lockId = this.generateLockId()
    const lock: StockLock = {
      lockId,
      productId,
      quantity,
      status: 'pending',
      createdAt: Date.now(),
      expireAt: Date.now() + ttl,
    }
    
    // 原子操作：预占库存
    const newInventory: InventoryState = {
      ...inventory,
      lockedStock: inventory.lockedStock + quantity,
      version: inventory.version + 1,
    }
    
    // CAS检查（Compare-And-Swap）
    if (this.casUpdate(productId, inventory, newInventory)) {
      this.locks.set(lockId, lock)
      this.scheduleExpiration(lockId, ttl)
      return lock
    } else {
      // 并发冲突，重试
      return this.lockStock(productId, quantity, ttl)
    }
  }
  
  // 确认预占（支付成功后调用）
  async confirmLock(lockId: string, orderId: string): Promise<void> {
    const lock = this.locks.get(lockId)
    if (!lock) throw new Error('锁不存在')
    if (lock.status !== 'pending') throw new Error('锁状态错误')
    
    const inventory = this.inventory.get(lock.productId)!
    
    // 原子操作：将预占转为已售
    const newInventory: InventoryState = {
      ...inventory,
      lockedStock: inventory.lockedStock - lock.quantity,
      soldStock: inventory.soldStock + lock.quantity,
      version: inventory.version + 1,
    }
    
    if (this.casUpdate(lock.productId, inventory, newInventory)) {
      lock.status = 'confirmed'
      lock.orderId = orderId
      this.cancelExpiration(lockId)
    }
  }
  
  // 释放预占（取消订单或超时）
  async releaseLock(lockId: string): Promise<void> {
    const lock = this.locks.get(lockId)
    if (!lock) return
    if (lock.status !== 'pending') return
    
    const inventory = this.inventory.get(lock.productId)!
    
    // 原子操作：释放预占
    const newInventory: InventoryState = {
      ...inventory,
      lockedStock: inventory.lockedStock - lock.quantity,
      version: inventory.version + 1,
    }
    
    if (this.casUpdate(lock.productId, inventory, newInventory)) {
      lock.status = 'released'
      this.cancelExpiration(lockId)
      this.notifyStockRecovered(lock.productId, lock.quantity)
    }
  }
  
  // 超时自动释放
  private scheduleExpiration(lockId: string, ttl: number) {
    const timer = setTimeout(() => {
      const lock = this.locks.get(lockId)
      if (lock && lock.status === 'pending') {
        lock.status = 'expired'
        this.releaseLock(lockId)
      }
    }, ttl)
    this.expireTimers.set(lockId, timer)
  }
  
  private cancelExpiration(lockId: string) {
    const timer = this.expireTimers.get(lockId)
    if (timer) {
      clearTimeout(timer)
      this.expireTimers.delete(lockId)
    }
  }
  
  // CAS更新
  private casUpdate(
    productId: string, 
    expected: InventoryState, 
    newInventory: InventoryState
  ): boolean {
    const current = this.inventory.get(productId)
    if (current?.version !== expected.version) {
      return false
    }
    this.inventory.set(productId, newInventory)
    return true
  }
  
  private generateLockId(): string {
    return \`lock_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`
  }
  
  private notifyStockRecovered(productId: string, quantity: number) {
    // 发送库存恢复事件
    eventBus.emit('stock:recovered', { productId, quantity })
  }
}

// ==================== React Hook ====================

function useInventory(productId: string) {
  const [state, setState] = useState<InventoryState | null>(null)
  const [lockInfo, setLockInfo] = useState<StockLock | null>(null)
  const inventoryService = useRef(new InventoryService())
  
  // 订阅库存变化
  useEffect(() => {
    const unsubscribe = eventBus.on('stock:changed', (e) => {
      if (e.productId === productId) {
        setState(e.inventory)
      }
    })
    
    // 初始加载
    inventoryService.current.getInventory(productId).then(setState)
    
    return unsubscribe
  }, [productId])
  
  // 预占库存
  const lockStock = useCallback(async (quantity: number) => {
    try {
      const lock = await inventoryService.current.lockStock(productId, quantity)
      setLockInfo(lock)
      return { success: true, lock }
    } catch (error) {
      if (error instanceof InventoryError) {
        return { 
          success: false, 
          error: error.code,
          available: error.data.available 
        }
      }
      throw error
    }
  }, [productId])
  
  // 取消预占
  const releaseStock = useCallback(async () => {
    if (lockInfo) {
      await inventoryService.current.releaseLock(lockInfo.lockId)
      setLockInfo(null)
    }
  }, [lockInfo])
  
  return {
    inventory: state,
    lockInfo,
    lockStock,
    releaseStock,
    isLocked: !!lockInfo,
  }
}

// ==================== 组件使用 ====================

function ProductBuyButton({ productId }: { productId: string }) {
  const { inventory, lockStock, releaseStock, isLocked } = useInventory(productId)
  const [status, setStatus] = useState<'idle' | 'locking' | 'paying'>('idle')
  
  const handleBuy = async () => {
    setStatus('locking')
    
    const result = await lockStock(1)
    
    if (!result.success) {
      setStatus('idle')
      if (result.error === 'INSUFFICIENT_STOCK') {
        toast.error(\`库存不足，仅剩 \${result.available} 件\`)
      }
      return
    }
    
    setStatus('paying')
    
    try {
      // 跳转支付页
      const order = await createOrder({ productId, lockId: result.lock.lockId })
      navigateToPay(order)
    } catch (error) {
      // 支付失败，释放库存
      await releaseStock()
      setStatus('idle')
      toast.error('下单失败，请重试')
    }
  }
  
  // 组件卸载时释放库存
  useEffect(() => {
    return () => {
      if (isLocked) {
        releaseStock()
      }
    }
  }, [isLocked])
  
  const availableStock = inventory?.availableStock ?? 0
  
  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500">
        库存: {availableStock} 件
        {inventory && inventory.lockedStock > 0 && (
          <span className="text-orange-400 ml-2">
            ({inventory.lockedStock}件预占中)
          </span>
        )}
      </div>
      
      <button 
        onClick={handleBuy}
        disabled={availableStock <= 0 || status !== 'idle'}
        className="w-full py-3 bg-red-500 text-white rounded-lg disabled:bg-gray-300"
      >
        {status === 'locking' ? '锁定库存中...' :
         status === 'paying' ? '正在创建订单...' :
         availableStock > 0 ? '立即购买' : '已售罄'}
      </button>
      
      {isLocked && (
        <div className="text-xs text-orange-500">
          已为您锁定1件库存，请在30分钟内完成支付
        </div>
      )}
    </div>
  )
}

// 🎯 核心价值：
// 1. 乐观锁防止超卖
// 2. 超时自动释放
// 3. 状态机管理库存状态
// 4. 补偿事务保证一致性`,
    designPattern: '状态机 + 乐观锁 + 补偿事务模式'
  },
  // ==================== 金融核心场景 ====================
  {
    id: 'account-freeze',
    title: '账户冻结与解冻',
    subtitle: '资金操作的状态管理',
    difficulty: 5,
    tags: ['状态机', '双写一致性', '幂等性'],
    category: '金融领域',
    problem: `金融系统的账户操作要求极高的准确性：

**场景特征（看到这些就该想到状态机+幂等性）：**

1. **资金冻结** - 下单时冻结金额，支付成功后扣款
2. **部分冻结** - 一笔钱分多次使用
3. **解冻回滚** - 交易失败时解冻资金
4. **并发安全** - 多笔交易同时操作同一账户
5. **审计追溯** - 每笔操作都要有记录

**前端挑战：**

- 实时余额显示
- 冻结状态展示
- 交易动画效果
- 失败重试机制`,
    badCode: `// ❌ 典型屎山：余额状态混乱
function AccountPage() {
  const [balance, setBalance] = useState(0)
  const [frozen, setFrozen] = useState(0)
  
  // 问题1: 直接修改状态，没有事务
  const handlePay = async (amount: number) => {
    if (balance < amount) {
      alert('余额不足')
      return
    }
    
    // 先冻结
    setFrozen(f => f + amount)
    setBalance(b => b - amount)
    
    try {
      await processPayment(amount)
      // 成功，扣减冻结
      setFrozen(f => f - amount)
    } catch (e) {
      // 失败，解冻
      setFrozen(f => f - amount)
      setBalance(b => b + amount)
    }
  }
  
  // 问题2: 并发操作会导致状态不一致
  // 问题3: 没有操作记录
  // 问题4: 没有幂等性保证`,
    goodCode: `// ✅ 优雅设计：状态机 + 双写一致性 + 幂等性

// ==================== 账户状态模型 ====================

interface Account {
  accountId: string
  balance: number           // 可用余额
  frozenAmount: number      // 冻结金额
  version: number           // 乐观锁版本号
  
  get totalBalance(): number {
    return this.balance + this.frozenAmount
  }
}

type TransactionType = 'freeze' | 'unfreeze' | 'deduct' | 'credit'
type TransactionStatus = 'pending' | 'success' | 'failed' | 'rollback'

interface Transaction {
  transactionId: string
  type: TransactionType
  amount: number
  status: TransactionStatus
  idempotencyKey: string    // 幂等键
  createdAt: number
  completedAt?: number
  relatedTransactionId?: string  // 关联交易（如解冻对应的冻结）
  metadata?: Record<string, any>
}

// ==================== 账户状态机 ====================

type AccountEvent = 
  | { type: 'FREEZE'; amount: number; idempotencyKey: string }
  | { type: 'UNFREEZE'; transactionId: string }
  | { type: 'DEDUCT'; transactionId: string }
  | { type: 'CREDIT'; amount: number; idempotencyKey: string }

class AccountStateMachine {
  private account: Account
  private transactions = new Map<string, Transaction>()
  private pendingOperations = new Map<string, Promise<any>>()
  
  constructor(account: Account) {
    this.account = account
  }
  
  // 冻结资金（幂等）
  async freeze(amount: number, idempotencyKey: string): Promise<Transaction> {
    // 幂等性检查
    const existing = this.findTransactionByIdempotencyKey(idempotencyKey)
    if (existing) {
      return existing  // 已处理过，直接返回
    }
    
    // 余额检查
    if (this.account.balance < amount) {
      throw new AccountError('INSUFFICIENT_BALANCE', {
        available: this.account.balance,
        required: amount,
      })
    }
    
    const transaction = this.createTransaction('freeze', amount, idempotencyKey)
    
    // 状态转换
    const newAccount: Account = {
      ...this.account,
      balance: this.account.balance - amount,
      frozenAmount: this.account.frozenAmount + amount,
      version: this.account.version + 1,
    }
    
    await this.applyChange(transaction, newAccount)
    return transaction
  }
  
  // 解冻资金（幂等）
  async unfreeze(transactionId: string): Promise<Transaction> {
    const freezeTx = this.transactions.get(transactionId)
    if (!freezeTx || freezeTx.type !== 'freeze') {
      throw new Error('冻结交易不存在')
    }
    
    if (freezeTx.status !== 'success') {
      throw new Error('冻结交易状态错误')
    }
    
    const idempotencyKey = \`unfreeze_\${transactionId}\`
    const existing = this.findTransactionByIdempotencyKey(idempotencyKey)
    if (existing) return existing
    
    const transaction = this.createTransaction('unfreeze', freezeTx.amount, idempotencyKey, transactionId)
    
    const newAccount: Account = {
      ...this.account,
      balance: this.account.balance + freezeTx.amount,
      frozenAmount: this.account.frozenAmount - freezeTx.amount,
      version: this.account.version + 1,
    }
    
    await this.applyChange(transaction, newAccount)
    return transaction
  }
  
  // 从冻结中扣款（支付成功后）
  async deduct(transactionId: string): Promise<Transaction> {
    const freezeTx = this.transactions.get(transactionId)
    if (!freezeTx || freezeTx.type !== 'freeze') {
      throw new Error('冻结交易不存在')
    }
    
    const idempotencyKey = \`deduct_\${transactionId}\`
    const existing = this.findTransactionByIdempotencyKey(idempotencyKey)
    if (existing) return existing
    
    const transaction = this.createTransaction('deduct', freezeTx.amount, idempotencyKey, transactionId)
    
    const newAccount: Account = {
      ...this.account,
      frozenAmount: this.account.frozenAmount - freezeTx.amount,
      version: this.account.version + 1,
    }
    
    await this.applyChange(transaction, newAccount)
    return transaction
  }
  
  // 入账（充值）
  async credit(amount: number, idempotencyKey: string): Promise<Transaction> {
    const existing = this.findTransactionByIdempotencyKey(idempotencyKey)
    if (existing) return existing
    
    const transaction = this.createTransaction('credit', amount, idempotencyKey)
    
    const newAccount: Account = {
      ...this.account,
      balance: this.account.balance + amount,
      version: this.account.version + 1,
    }
    
    await this.applyChange(transaction, newAccount)
    return transaction
  }
  
  // 创建交易记录
  private createTransaction(
    type: TransactionType,
    amount: number,
    idempotencyKey: string,
    relatedId?: string
  ): Transaction {
    const transaction: Transaction = {
      transactionId: this.generateTransactionId(),
      type,
      amount,
      status: 'pending',
      idempotencyKey,
      createdAt: Date.now(),
      relatedTransactionId: relatedId,
    }
    this.transactions.set(transaction.transactionId, transaction)
    return transaction
  }
  
  // 应用变更（双写一致性）
  private async applyChange(transaction: Transaction, newAccount: Account): Promise<void> {
    try {
      // 1. 先写交易记录
      transaction.status = 'success'
      transaction.completedAt = Date.now()
      
      // 2. 再更新账户状态
      this.account = newAccount
      
      // 3. 发布事件
      eventBus.emit('account:changed', {
        account: this.account,
        transaction,
      })
      
    } catch (error) {
      transaction.status = 'failed'
      throw error
    }
  }
  
  private findTransactionByIdempotencyKey(key: string): Transaction | undefined {
    for (const tx of this.transactions.values()) {
      if (tx.idempotencyKey === key) return tx
    }
    return undefined
  }
  
  private generateTransactionId(): string {
    return \`tx_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`
  }
  
  getAccount(): Account {
    return { ...this.account }
  }
  
  getTransactions(): Transaction[] {
    return Array.from(this.transactions.values())
  }
}

// ==================== React Hook ====================

function useAccount(accountId: string) {
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const machineRef = useRef<AccountStateMachine | null>(null)
  
  useEffect(() => {
    // 初始化账户状态机
    fetchAccount(accountId).then(acc => {
      machineRef.current = new AccountStateMachine(acc)
      setAccount(acc)
    })
    
    // 订阅账户变化
    const unsub = eventBus.on('account:changed', (e) => {
      setAccount(e.account)
      setTransactions(prev => [e.transaction, ...prev])
    })
    
    return unsub
  }, [accountId])
  
  const freeze = useCallback(async (amount: number, key?: string) => {
    if (!machineRef.current) throw new Error('账户未初始化')
    return machineRef.current.freeze(amount, key || \`freeze_\${Date.now()}\`)
  }, [])
  
  const unfreeze = useCallback(async (transactionId: string) => {
    if (!machineRef.current) throw new Error('账户未初始化')
    return machineRef.current.unfreeze(transactionId)
  }, [])
  
  const deduct = useCallback(async (transactionId: string) => {
    if (!machineRef.current) throw new Error('账户未初始化')
    return machineRef.current.deduct(transactionId)
  }, [])
  
  return {
    account,
    transactions,
    freeze,
    unfreeze,
    deduct,
    availableBalance: account?.balance ?? 0,
    frozenAmount: account?.frozenAmount ?? 0,
  }
}

// ==================== 组件使用 ====================

function AccountCard({ accountId }: { accountId: string }) {
  const { account, availableBalance, frozenAmount, transactions, freeze, unfreeze, deduct } = 
    useAccount(accountId)
  
  const handlePay = async (amount: number) => {
    try {
      // 1. 冻结资金
      const freezeTx = await freeze(amount, \`pay_\${Date.now()}\`)
      
      // 2. 发起支付
      const payResult = await processPayment({ amount, freezeId: freezeTx.transactionId })
      
      if (payResult.success) {
        // 3. 扣款
        await deduct(freezeTx.transactionId)
        toast.success('支付成功')
      } else {
        // 4. 解冻
        await unfreeze(freezeTx.transactionId)
        toast.error('支付失败')
      }
    } catch (error) {
      if (error instanceof AccountError) {
        toast.error(\`余额不足，可用余额 \${error.data.available} 元\`)
      }
    }
  }
  
  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center">
        <span className="text-gray-500">可用余额</span>
        <span className="text-2xl font-bold text-green-600">
          ¥{availableBalance.toFixed(2)}
        </span>
      </div>
      
      {frozenAmount > 0 && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">冻结金额</span>
          <span className="text-orange-500">¥{frozenAmount.toFixed(2)}</span>
        </div>
      )}
      
      {/* 最近交易 */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium mb-2">最近交易</h3>
        <div className="space-y-2 max-h-40 overflow-auto">
          {transactions.slice(0, 5).map(tx => (
            <div key={tx.transactionId} className="flex justify-between text-sm">
              <span className={\`text-\${tx.type === 'credit' ? 'green' : 'red'}-500\`}>
                {tx.type === 'freeze' ? '冻结' :
                 tx.type === 'unfreeze' ? '解冻' :
                 tx.type === 'deduct' ? '支出' : '收入'}
              </span>
              <span>¥{tx.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 🎯 核心价值：
// 1. 状态机保证操作顺序
// 2. 幂等性防止重复操作
// 3. 双写一致性保证数据正确
// 4. 完整的交易记录追溯`,
    designPattern: '状态机 + 幂等性模式 + 双写一致性'
  },
  {
    id: 'distributed-id',
    title: '分布式ID生成',
    subtitle: '雪花算法在前端的应用',
    difficulty: 4,
    tags: ['雪花算法', '分布式ID', '唯一性'],
    category: '金融领域',
    problem: `分布式ID生成是分布式系统的基础设施：

**场景特征（看到这些就该想到雪花算法）：**

1. **订单号** - 全局唯一，不能重复
2. **交易流水号** - 需要时间有序
3. **追踪ID** - 分布式追踪
4. **临时ID** - 前端生成，后端确认

**为什么不能用UUID？**

- UUID无序，数据库索引性能差
- UUID太长，存储和传输成本高
- UUID不含业务信息

**雪花算法ID结构：**

| 1bit | 41bit时间戳 | 10bit机器ID | 12bit序列号 |
|------|------------|------------|------------|
| 符号位 | 毫秒级时间 | 数据中心+机器 | 毫秒内序列 |`,
    badCode: `// ❌ 典型屎山：各种ID生成方式混乱
function generateOrderId() {
  // 问题1: 用随机数，可能重复
  return 'order_' + Math.random().toString(36).slice(2)
}

function generateTransactionId() {
  // 问题2: 用时间戳，并发时可能重复
  return 'tx_' + Date.now()
}

function generateTempId() {
  // 问题3: UUID太长，且无序
  return crypto.randomUUID()  // 如 "550e8400-e29b-41d4-a716-446655440000"
}

// 问题：
// 1. 没有统一的ID生成策略
// 2. 不同业务用不同方式，维护困难
// 3. 高并发时可能重复
// 4. ID不包含时间信息，难以排序`,
    goodCode: `// ✅ 优雅设计：雪花算法 + ID生成器

// ==================== 雪花算法ID生成器 ====================

class SnowflakeIdGenerator {
  // 配置
  private readonly epoch: number       // 起始时间戳（如2024-01-01）
  private readonly workerId: number    // 机器ID (0-31)
  private readonly datacenterId: number // 数据中心ID (0-31)
  
  // 状态
  private sequence = 0
  private lastTimestamp = -1
  
  // 位数配置
  private readonly workerIdBits = 5
  private readonly datacenterIdBits = 5
  private readonly sequenceBits = 12
  
  private readonly maxWorkerId = (1 << this.workerIdBits) - 1  // 31
  private readonly maxDatacenterId = (1 << this.datacenterIdBits) - 1  // 31
  private readonly sequenceMask = (1 << this.sequenceBits) - 1  // 4095
  
  // 位移
  private readonly workerIdShift = this.sequenceBits  // 12
  private readonly datacenterIdShift = this.sequenceBits + this.workerIdBits  // 17
  private readonly timestampLeftShift = this.sequenceBits + this.workerIdBits + this.datacenterIdBits  // 22
  
  constructor(config: {
    epoch?: number           // 起始时间戳
    workerId?: number        // 机器ID
    datacenterId?: number    // 数据中心ID
  } = {}) {
    this.epoch = config.epoch || 1704067200000  // 2024-01-01
    this.workerId = config.workerId ?? this.getWorkerIdFromStorage()
    this.datacenterId = config.datacenterId ?? 0
    
    // 校验
    if (this.workerId > this.maxWorkerId || this.workerId < 0) {
      throw new Error(\`workerId must be between 0 and \${this.maxWorkerId}\`)
    }
    if (this.datacenterId > this.maxDatacenterId || this.datacenterId < 0) {
      throw new Error(\`datacenterId must be between 0 and \${this.maxDatacenterId}\`)
    }
  }
  
  // 生成下一个ID
  nextId(): string {
    let timestamp = this.currentTimeMillis()
    
    // 时钟回拨检测
    if (timestamp < this.lastTimestamp) {
      throw new Error(\`Clock moved backwards. Refusing to generate id for \${this.lastTimestamp - timestamp}ms\`)
    }
    
    // 同一毫秒内
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & this.sequenceMask
      
      // 序列号溢出，等待下一毫秒
      if (this.sequence === 0) {
        timestamp = this.waitNextMillis(this.lastTimestamp)
      }
    } else {
      // 新毫秒，序列号重置
      this.sequence = 0
    }
    
    this.lastTimestamp = timestamp
    
    // 组装ID
    const id = ((timestamp - this.epoch) << this.timestampLeftShift)
      | (this.datacenterId << this.datacenterIdShift)
      | (this.workerId << this.workerIdShift)
      | this.sequence
    
    return id.toString()
  }
  
  // 解析ID信息
  parseId(id: string): IdInfo {
    const num = BigInt(id)
    
    const timestamp = Number((num >> BigInt(this.timestampLeftShift)) + BigInt(this.epoch))
    const datacenterId = Number((num >> BigInt(this.datacenterIdShift)) & BigInt(this.maxDatacenterId))
    const workerId = Number((num >> BigInt(this.workerIdShift)) & BigInt(this.maxWorkerId))
    const sequence = Number(num & BigInt(this.sequenceMask))
    
    return {
      id,
      timestamp: new Date(timestamp),
      datacenterId,
      workerId,
      sequence,
      date: new Date(timestamp).toISOString(),
    }
  }
  
  private currentTimeMillis(): number {
    return Date.now()
  }
  
  private waitNextMillis(lastTimestamp: number): number {
    let timestamp = this.currentTimeMillis()
    while (timestamp <= lastTimestamp) {
      timestamp = this.currentTimeMillis()
    }
    return timestamp
  }
  
  private getWorkerIdFromStorage(): number {
    // 从localStorage获取或生成workerId
    const stored = localStorage.getItem('snowflake_worker_id')
    if (stored) return parseInt(stored, 10)
    
    const workerId = Math.floor(Math.random() * this.maxWorkerId)
    localStorage.setItem('snowflake_worker_id', workerId.toString())
    return workerId
  }
}

interface IdInfo {
  id: string
  timestamp: Date
  datacenterId: number
  workerId: number
  sequence: number
  date: string
}

// ==================== 业务ID生成器 ====================

class BusinessIdGenerator {
  private snowflake: SnowflakeIdGenerator
  
  constructor() {
    this.snowflake = new SnowflakeIdGenerator()
  }
  
  // 订单ID
  orderId(): string {
    return 'ORD' + this.snowflake.nextId()
  }
  
  // 交易流水号
  transactionId(): string {
    return 'TXN' + this.snowflake.nextId()
  }
  
  // 支付流水号
  paymentId(): string {
    return 'PAY' + this.snowflake.nextId()
  }
  
  // 退款流水号
  refundId(): string {
    return 'RFD' + this.snowflake.nextId()
  }
  
  // 用户ID（注册时前端生成）
  userId(): string {
    return 'USR' + this.snowflake.nextId()
  }
  
  // 追踪ID（用于日志追踪）
  traceId(): string {
    return 'TRC' + this.snowflake.nextId()
  }
  
  // 临时ID（用于前端临时标识）
  tempId(): string {
    return 'TMP' + this.snowflake.nextId()
  }
  
  // 解析ID
  parse(id: string): IdInfo & { type: string } {
    const type = id.slice(0, 3)
    const pureId = id.slice(3)
    return { ...this.snowflake.parseId(pureId), type }
  }
}

// ==================== 全局实例 ====================

const idGenerator = new BusinessIdGenerator()

// ==================== React Hook ====================

function useIdGenerator() {
  return idGenerator
}

// ==================== 使用示例 ====================

function OrderCreateForm() {
  const idGen = useIdGenerator()
  const [orderId, setOrderId] = useState<string>('')
  
  const handleCreateOrder = async () => {
    // 前端预生成订单ID
    const newOrderId = idGen.orderId()
    setOrderId(newOrderId)
    
    // 可以在创建前就记录日志
    console.log(\`Creating order \${newOrderId} at \${new Date().toISOString()}\`)
    
    try {
      await createOrder({
        orderId: newOrderId,
        // ... 其他订单信息
      })
    } catch (error) {
      // 即使失败，ID也是唯一的，可以用于追踪
      console.error(\`Order \${newOrderId} creation failed:\`, error)
    }
  }
  
  return (
    <div>
      <button onClick={handleCreateOrder}>创建订单</button>
      {orderId && <div>订单号: {orderId}</div>}
    </div>
  )
}

// 🎯 核心价值：
// 1. 全局唯一，永不重复
// 2. 时间有序，便于排序
// 3. 包含业务前缀，可读性强
// 4. 支持解析，便于排查问题`,
    designPattern: '雪花算法 + 工厂模式'
  },
  {
    id: 'quote-merge',
    title: '报价推送与合并',
    subtitle: '高频数据更新优化',
    difficulty: 5,
    tags: ['数据合并', '虚拟DOM', '批量更新'],
    category: '金融领域',
    problem: `金融行情数据推送是典型的高频更新场景：

**场景特征（看到这些就该想到数据合并+批量更新）：**

1. **高频推送** - 每秒几百上千次更新
2. **数据合并** - 同一股票多次更新，只需渲染最新值
3. **批量更新** - 多支股票同时更新，合并渲染
4. **增量更新** - 只更新变化的字段
5. **优先级** - 自选股优先更新

**性能问题：**

- 每次推送都setState，React重新渲染
- 同一数据多次更新，浪费性能
- 大量DOM操作，页面卡顿`,
    badCode: `// ❌ 典型屎山：每次推送都setState
function StockList({ symbols }: { symbols: string[] }) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  
  useEffect(() => {
    const ws = new WebSocket('wss://quotes.example.com')
    
    ws.onmessage = (event) => {
      const quote: Quote = JSON.parse(event.data)
      
      // 问题1: 每条消息都setState，触发重渲染
      setQuotes(prev => {
        const next = new Map(prev)
        next.set(quote.symbol, quote)
        return next  // 每次都创建新Map，触发渲染
      })
    }
    
    return () => ws.close()
  }, [])
  
  // 问题2: 整个列表重新渲染
  // 问题3: 高频推送时页面卡死
  // 问题4: 没有数据合并
  
  return (
    <div>
      {symbols.map(symbol => (
        <StockCard key={symbol} quote={quotes.get(symbol)} />
      ))}
    </div>
  )
}`,
    goodCode: `// ✅ 优雅设计：数据合并 + 批量更新 + 虚拟化

// ==================== 报价数据管理器 ====================

interface Quote {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  turnover: number
  bidPrice: number
  askPrice: number
  high: number
  low: number
  open: number
  prevClose: number
  timestamp: number
}

interface QuoteUpdate {
  symbol: string
  partial: Partial<Quote>  // 增量更新
  timestamp: number
}

class QuoteManager {
  private quotes = new Map<string, Quote>()
  private pendingUpdates = new Map<string, QuoteUpdate>()
  private subscribers = new Set<(quotes: Map<string, Quote>) => void>()
  private batchTimer: NodeJS.Timeout | null = null
  private readonly batchInterval = 50  // 50ms批处理
  
  // 接收更新（高频调用）
  receiveUpdate(symbol: string, update: Partial<Quote>) {
    // 合并到待处理队列
    const existing = this.pendingUpdates.get(symbol)
    if (existing) {
      existing.partial = { ...existing.partial, ...update }
      existing.timestamp = Date.now()
    } else {
      this.pendingUpdates.set(symbol, {
        symbol,
        partial: update,
        timestamp: Date.now(),
      })
    }
    
    // 触发批处理
    this.scheduleBatch()
  }
  
  // 批量接收
  receiveBatchUpdates(updates: Array<{ symbol: string; data: Partial<Quote> }>) {
    for (const { symbol, data } of updates) {
      this.receiveUpdate(symbol, data)
    }
  }
  
  // 调度批处理
  private scheduleBatch() {
    if (this.batchTimer) return
    
    this.batchTimer = setTimeout(() => {
      this.flush()
      this.batchTimer = null
    }, this.batchInterval)
  }
  
  // 立即刷新
  flush() {
    if (this.pendingUpdates.size === 0) return
    
    // 合并更新到主数据
    for (const [symbol, update] of this.pendingUpdates) {
      const existing = this.quotes.get(symbol)
      if (existing) {
        // 增量合并
        this.quotes.set(symbol, {
          ...existing,
          ...update.partial,
          timestamp: update.timestamp,
        })
      } else {
        // 新股票
        this.quotes.set(symbol, update.partial as Quote)
      }
    }
    
    // 清空待处理
    this.pendingUpdates.clear()
    
    // 通知订阅者（只触发一次）
    this.notify()
  }
  
  // 订阅变化
  subscribe(callback: (quotes: Map<string, Quote>) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }
  
  // 通知订阅者
  private notify() {
    const snapshot = new Map(this.quotes)
    for (const callback of this.subscribers) {
      callback(snapshot)
    }
  }
  
  // 获取单支股票
  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol)
  }
  
  // 获取所有报价
  getQuotes(): Map<string, Quote> {
    return new Map(this.quotes)
  }
}

// ==================== WebSocket管理 ====================

class QuoteWebSocket {
  private ws: WebSocket | null = null
  private quoteManager: QuoteManager
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private heartbeatTimer: NodeJS.Timeout | null = null
  
  constructor(quoteManager: QuoteManager) {
    this.quoteManager = quoteManager
  }
  
  connect(url: string) {
    this.ws = new WebSocket(url)
    
    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (Array.isArray(data)) {
        // 批量推送
        this.quoteManager.receiveBatchUpdates(
          data.map(item => ({ symbol: item.s, data: this.transformQuote(item) }))
        )
      } else {
        // 单条推送
        this.quoteManager.receiveUpdate(data.s, this.transformQuote(data))
      }
    }
    
    this.ws.onclose = () => {
      console.log('WebSocket closed')
      this.stopHeartbeat()
      this.reconnect(url)
    }
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }
  
  // 订阅股票
  subscribe(symbols: string[]) {
    this.send({ action: 'subscribe', symbols })
  }
  
  // 取消订阅
  unsubscribe(symbols: string[]) {
    this.send({ action: 'unsubscribe', symbols })
  }
  
  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }
  
  private transformQuote(data: any): Partial<Quote> {
    return {
      symbol: data.s,
      price: data.p,
      change: data.c,
      changePercent: data.cp,
      volume: data.v,
      turnover: data.t,
      timestamp: data.ts,
    }
  }
  
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: 'ping' })
    }, 30000)
  }
  
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
  
  private reconnect(url: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(\`Reconnecting in \${delay}ms (attempt \${this.reconnectAttempts})\`)
    
    setTimeout(() => {
      this.connect(url)
    }, delay)
  }
  
  disconnect() {
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
  }
}

// ==================== React Hook ====================

function useQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const managerRef = useRef<QuoteManager>()
  const wsRef = useRef<QuoteWebSocket>()
  
  useEffect(() => {
    // 创建管理器
    managerRef.current = new QuoteManager()
    
    // 订阅更新（防抖后的批量更新）
    const unsubscribe = managerRef.current.subscribe((newQuotes) => {
      setQuotes(newQuotes)
    })
    
    // 创建WebSocket
    wsRef.current = new QuoteWebSocket(managerRef.current)
    wsRef.current.connect('wss://quotes.example.com')
    
    return () => {
      unsubscribe()
      wsRef.current?.disconnect()
    }
  }, [])
  
  // 订阅股票
  useEffect(() => {
    if (symbols.length > 0) {
      wsRef.current?.subscribe(symbols)
    }
    
    return () => {
      if (symbols.length > 0) {
        wsRef.current?.unsubscribe(symbols)
      }
    }
  }, [symbols])
  
  return {
    quotes,
    getQuote: (symbol: string) => quotes.get(symbol),
    refresh: () => managerRef.current?.flush(),
  }
}

// ==================== 优化的股票卡片 ====================

const StockCard = memo(function StockCard({ quote }: { quote: Quote }) {
  const isUp = quote.change >= 0
  
  return (
    <div className="flex justify-between items-center p-2 border-b">
      <span className="font-medium">{quote.symbol}</span>
      <span className={isUp ? 'text-red-500' : 'text-green-500'}>
        {quote.price.toFixed(2)}
      </span>
      <span className={isUp ? 'text-red-500' : 'text-green-500'}>
        {isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
      </span>
    </div>
  )
}, (prev, next) => {
  // 自定义比较：只有价格或涨跌幅变化才重渲染
  return prev.quote.price === next.quote.price && 
         prev.quote.changePercent === next.quote.changePercent
})

// ==================== 使用示例 ====================

function StockWatchlist() {
  const symbols = ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN']
  const { quotes } = useQuotes(symbols)
  
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h2 className="font-bold">自选股</h2>
      </div>
      <div>
        {symbols.map(symbol => {
          const quote = quotes.get(symbol)
          if (!quote) return <div key={symbol}>Loading...</div>
          return <StockCard key={symbol} quote={quote} />
        })}
      </div>
    </div>
  )
}

// 🎯 核心价值：
// 1. 高频推送合并为批量更新
// 2. 50ms批处理间隔，减少渲染次数
// 3. 增量更新，减少数据传输
// 4. memo + 自定义比较，减少重渲染`,
    designPattern: '数据合并模式 + 批量更新模式 + 观察者模式'
  },
  // ==================== 企业级场景 ====================
  {
    id: 'data-permission',
    title: '数据权限过滤',
    subtitle: '行级权限与字段脱敏',
    difficulty: 5,
    tags: ['策略模式', '组合模式', 'AOP'],
    category: '企业级场景',
    problem: `企业级应用常见的数据权限需求：

**场景特征（看到这些就该想到策略模式+AOP）：**

1. **行级权限** - 销售只能看自己的客户，经理能看团队
2. **字段脱敏** - 手机号、身份证部分隐藏
3. **数据范围** - 不同角色看不同数据范围
4. **动态规则** - 权限规则可配置变化
5. **性能优化** - 大数据量下的权限过滤

**典型场景：**

- 销售看自己的订单
- 经理看部门的数据
- 财务看全部但敏感字段脱敏
- 外部合作方看脱敏数据`,
    badCode: `// ❌ 典型屎山：到处写权限判断
function OrderList() {
  const user = useCurrentUser()
  const [orders, setOrders] = useState([])
  
  useEffect(() => {
    fetchOrders().then(data => {
      // 问题1: 权限判断写死在组件里
      let filtered = data
      
      if (user.role === 'sales') {
        filtered = data.filter(o => o.salesId === user.id)
      } else if (user.role === 'manager') {
        filtered = data.filter(o => o.departmentId === user.departmentId)
      } else if (user.role === 'finance') {
        // 问题2: 脱敏逻辑散落各处
        filtered = data.map(o => ({
          ...o,
          customerPhone: o.customerPhone.slice(0, 3) + '****' + o.customerPhone.slice(-4),
          customerEmail: o.customerEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
        }))
      }
      // 问题3: 新增角色要改代码
      // 问题4: 同一逻辑要在多处复制
      
      setOrders(filtered)
    })
  }, [user])
  
  return <Table data={orders} />
}`,
    goodCode: `// ✅ 优雅设计：策略模式 + 组合模式 + AOP

// ==================== 权限模型 ====================

interface User {
  id: string
  role: string
  departmentId?: string
  teamIds?: string[]
  permissions: string[]
}

interface DataPermission {
  resource: string           // 资源类型
  scope: 'all' | 'department' | 'team' | 'self'  // 数据范围
  fields?: string[]          // 可见字段
  maskedFields?: FieldMask[] // 脱敏字段
  conditions?: Condition[]   // 额外条件
}

interface FieldMask {
  field: string
  type: 'phone' | 'email' | 'idcard' | 'bankcard' | 'custom'
  pattern?: string
  showFirst?: number
  showLast?: number
}

interface Condition {
  field: string
  operator: 'eq' | 'ne' | 'in' | 'gt' | 'lt' | 'contains'
  value: any
}

// ==================== 脱敏策略 ====================

interface MaskStrategy {
  type: string
  mask(value: string, config?: FieldMask): string
}

const PhoneMaskStrategy: MaskStrategy = {
  type: 'phone',
  mask(value, config) {
    const showFirst = config?.showFirst ?? 3
    const showLast = config?.showLast ?? 4
    if (value.length <= showFirst + showLast) return '***'
    return value.slice(0, showFirst) + '****' + value.slice(-showLast)
  }
}

const EmailMaskStrategy: MaskStrategy = {
  type: 'email',
  mask(value) {
    const [local, domain] = value.split('@')
    const masked = local.slice(0, 2) + '***'
    return masked + '@' + domain
  }
}

const IdCardMaskStrategy: MaskStrategy = {
  type: 'idcard',
  mask(value) {
    if (value.length !== 18) return '***'
    return value.slice(0, 6) + '********' + value.slice(-4)
  }
}

const BankCardMaskStrategy: MaskStrategy = {
  type: 'bankcard',
  mask(value) {
    return '**** **** **** ' + value.slice(-4)
  }
}

const maskStrategies = new Map<string, MaskStrategy>([
  ['phone', PhoneMaskStrategy],
  ['email', EmailMaskStrategy],
  ['idcard', IdCardMaskStrategy],
  ['bankcard', BankCardMaskStrategy],
])

// ==================== 权限过滤器 ====================

class DataPermissionFilter {
  private permissions = new Map<string, DataPermission[]>()
  private maskStrategies = maskStrategies
  
  // 配置权限
  configure(role: string, permission: DataPermission) {
    const existing = this.permissions.get(role) || []
    existing.push(permission)
    this.permissions.set(role, existing)
  }
  
  // 过滤数据（行级权限）
  filterRows<T extends Record<string, any>>(
    data: T[],
    resource: string,
    user: User
  ): T[] {
    const permission = this.getPermission(user.role, resource)
    if (!permission) return data
    
    let result = data
    
    // 根据scope过滤
    switch (permission.scope) {
      case 'all':
        break  // 不过滤
      case 'department':
        result = data.filter(item => 
          item.departmentId === user.departmentId
        )
        break
      case 'team':
        result = data.filter(item => 
          user.teamIds?.includes(item.teamId)
        )
        break
      case 'self':
        result = data.filter(item => 
          item.creatorId === user.id || item.ownerId === user.id
        )
        break
    }
    
    // 应用额外条件
    if (permission.conditions) {
      for (const cond of permission.conditions) {
        result = result.filter(item => 
          this.evaluateCondition(item, cond, user)
        )
      }
    }
    
    return result
  }
  
  // 过滤字段（字段脱敏）
  filterFields<T extends Record<string, any>>(
    data: T,
    resource: string,
    user: User
  ): T {
    const permission = this.getPermission(user.role, resource)
    if (!permission) return data
    
    let result = { ...data }
    
    // 字段白名单
    if (permission.fields) {
      const allowed = new Set(permission.fields)
      for (const key of Object.keys(result)) {
        if (!allowed.has(key)) {
          delete result[key]
        }
      }
    }
    
    // 字段脱敏
    if (permission.maskedFields) {
      for (const mask of permission.maskedFields) {
        if (result[mask.field] !== undefined) {
          result[mask.field] = this.maskValue(
            result[mask.field], 
            mask
          )
        }
      }
    }
    
    return result
  }
  
  // 批量处理
  process<T extends Record<string, any>>(
    data: T[],
    resource: string,
    user: User
  ): T[] {
    // 先过滤行
    const filtered = this.filterRows(data, resource, user)
    // 再过滤字段
    return filtered.map(item => this.filterFields(item, resource, user))
  }
  
  private getPermission(role: string, resource: string): DataPermission | undefined {
    const permissions = this.permissions.get(role) || []
    return permissions.find(p => p.resource === resource)
  }
  
  private evaluateCondition(item: any, condition: Condition, user: User): boolean {
    const value = this.resolveValue(item, condition.field, user)
    
    switch (condition.operator) {
      case 'eq': return value === condition.value
      case 'ne': return value !== condition.value
      case 'in': return condition.value.includes(value)
      case 'gt': return value > condition.value
      case 'lt': return value < condition.value
      case 'contains': return String(value).includes(condition.value)
      default: return true
    }
  }
  
  private resolveValue(item: any, field: string, user: User): any {
    // 支持 $user.id 这样的动态值
    if (field.startsWith('$user.')) {
      const userField = field.slice(6)
      return (user as any)[userField]
    }
    return item[field]
  }
  
  private maskValue(value: string, config: FieldMask): string {
    const strategy = this.maskStrategies.get(config.type)
    if (!strategy) return value
    
    if (config.type === 'custom' && config.pattern) {
      return value.replace(new RegExp(config.pattern), '***')
    }
    
    return strategy.mask(value, config)
  }
}

// ==================== 配置权限 ====================

const permissionFilter = new DataPermissionFilter()

// 销售角色：只能看自己的订单
permissionFilter.configure('sales', {
  resource: 'order',
  scope: 'self',
  maskedFields: [
    { field: 'customerPhone', type: 'phone' },
    { field: 'customerEmail', type: 'email' },
  ]
})

// 经理角色：看部门订单
permissionFilter.configure('manager', {
  resource: 'order',
  scope: 'department',
  maskedFields: [
    { field: 'customerPhone', type: 'phone' },
  ]
})

// 财务角色：看全部，但敏感字段脱敏
permissionFilter.configure('finance', {
  resource: 'order',
  scope: 'all',
  maskedFields: [
    { field: 'customerPhone', type: 'phone' },
    { field: 'customerEmail', type: 'email' },
    { field: 'customerIdCard', type: 'idcard' },
    { field: 'customerBankCard', type: 'bankcard' },
  ]
})

// 管理员：看全部，不脱敏
permissionFilter.configure('admin', {
  resource: 'order',
  scope: 'all',
})

// ==================== React Hook ====================

function useDataPermission() {
  const user = useCurrentUser()
  const filter = useRef(permissionFilter)
  
  const process = useCallback(<T extends Record<string, any>>(
    data: T[],
    resource: string
  ): T[] => {
    return filter.current.process(data, resource, user)
  }, [user])
  
  return { process }
}

// ==================== AOP装饰器（可选） ====================

function withPermission<T extends any[], R>(
  resource: string,
  fn: (...args: T) => Promise<R[]>
): (...args: T) => Promise<R[]> {
  return async (...args: T) => {
    const data = await fn(...args)
    const user = getCurrentUser()
    return permissionFilter.process(data, resource, user)
  }
}

// 使用装饰器
const fetchOrdersWithPermission = withPermission('order', fetchOrders)

// ==================== 组件使用 ====================

function OrderList() {
  const [orders, setOrders] = useState<Order[]>([])
  const { process } = useDataPermission()
  
  useEffect(() => {
    fetchOrders().then(data => {
      // 自动应用权限过滤
      const filtered = process(data, 'order')
      setOrders(filtered)
    })
  }, [process])
  
  return <Table data={orders} />
}

// 🎯 核心价值：
// 1. 权限规则集中配置
// 2. 新增角色只需加配置
// 3. 行级权限+字段脱敏统一处理
// 4. AOP方式无侵入`,
    designPattern: '策略模式 + 组合模式 + AOP切面编程'
  },
  {
    id: 'audit-trail',
    title: '操作审计追踪',
    subtitle: '完整的操作日志链',
    difficulty: 4,
    tags: ['责任链', '观察者', '装饰器'],
    category: '企业级场景',
    problem: `企业级应用需要完整的操作追踪：

**场景特征（看到这些就该想到装饰器+观察者）：**

1. **操作记录** - 谁、什么时候、做了什么
2. **变更追踪** - 数据的前后变化
3. **链路追溯** - 操作之间的关联
4. **审计查询** - 按时间、操作人、类型查询
5. **合规要求** - 金融、医疗等行业强制要求

**典型场景：**

- 订单状态变更记录
- 合同审批流程追踪
- 资金操作日志
- 敏感数据访问记录`,
    badCode: `// ❌ 典型屎山：操作日志散落各处
async function updateOrderStatus(orderId: string, status: string) {
  // 问题1: 日志记录散落在业务代码里
  console.log(\`Update order \${orderId} status to \${status}\`)
  
  await updateOrder(orderId, { status })
  
  // 问题2: 没有统一格式
  await saveLog({
    action: 'update_order',
    orderId,
    status,
    time: new Date(),
    user: currentUser.id
  })
  
  // 问题3: 没有记录变更前后的值
  // 问题4: 没有关联上下游操作
  // 问题5: 每个操作都要手动写日志`,
    goodCode: `// ✅ 优雅设计：装饰器 + 责任链 + 观察者

// ==================== 审计日志模型 ====================

interface AuditLog {
  id: string
  traceId: string           // 链路追踪ID
  parentLogId?: string      // 父操作ID（用于关联）
  
  // 操作信息
  action: string            // 操作类型
  resource: string          // 资源类型
  resourceId: string        // 资源ID
  
  // 操作人
  operator: {
    userId: string
    userName: string
    role: string
    ip: string
    userAgent: string
  }
  
  // 变更详情
  changes: {
    field: string
    oldValue: any
    newValue: any
  }[]
  
  // 上下文
  context: {
    module: string          // 模块
    feature: string         // 功能
    correlationId?: string  // 关联ID（如订单号）
  }
  
  // 时间
  timestamp: number
  duration?: number         // 操作耗时
  
  // 结果
  result: 'success' | 'failed'
  errorMessage?: string
}

// ==================== 审计上下文 ====================

class AuditContext {
  private static current: AuditContext | null = null
  
  traceId: string
  parentLogId?: string
  logs: AuditLog[] = []
  startTime: number
  
  constructor(traceId?: string) {
    this.traceId = traceId || this.generateTraceId()
    this.startTime = Date.now()
  }
  
  static start(traceId?: string): AuditContext {
    this.current = new AuditContext(traceId)
    return this.current
  }
  
  static getCurrent(): AuditContext | null {
    return this.current
  }
  
  static end() {
    if (this.current) {
      // 批量保存日志
      auditLogger.saveBatch(this.current.logs)
      this.current = null
    }
  }
  
  addLog(log: Omit<AuditLog, 'id' | 'traceId' | 'parentLogId'>) {
    const fullLog: AuditLog = {
      id: this.generateLogId(),
      traceId: this.traceId,
      parentLogId: this.parentLogId,
      ...log,
    }
    this.logs.push(fullLog)
    return fullLog.id
  }
  
  private generateTraceId(): string {
    return \`trace_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`
  }
  
  private generateLogId(): string {
    return \`log_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`
  }
}

// ==================== 审计装饰器 ====================

function auditable(config: {
  action: string
  resource: string
  trackChanges?: boolean
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value
    
    descriptor.value = async function (...args: any[]) {
      const user = getCurrentUser()
      const context = AuditContext.getCurrent() || AuditContext.start()
      const startTime = Date.now()
      
      let oldValue: any = null
      if (config.trackChanges && args[0]) {
        // 获取变更前的值
        oldValue = await this.getResource(args[0])
      }
      
      try {
        const result = await original.apply(this, args)
        
        // 记录成功日志
        const changes = config.trackChanges 
          ? diffObjects(oldValue, result)
          : []
        
        context.addLog({
          action: config.action,
          resource: config.resource,
          resourceId: args[0]?.id || args[0],
          operator: {
            userId: user.id,
            userName: user.name,
            role: user.role,
            ip: getClientIp(),
            userAgent: getUserAgent(),
          },
          changes,
          context: {
            module: target.constructor.name,
            feature: propertyKey,
          },
          timestamp: startTime,
          duration: Date.now() - startTime,
          result: 'success',
        })
        
        return result
        
      } catch (error) {
        // 记录失败日志
        context.addLog({
          action: config.action,
          resource: config.resource,
          resourceId: args[0]?.id || args[0],
          operator: {
            userId: user.id,
            userName: user.name,
            role: user.role,
            ip: getClientIp(),
            userAgent: getUserAgent(),
          },
          changes: [],
          context: {
            module: target.constructor.name,
            feature: propertyKey,
          },
          timestamp: startTime,
          duration: Date.now() - startTime,
          result: 'failed',
          errorMessage: error.message,
        })
        
        throw error
      }
    }
    
    return descriptor
  }
}

// ==================== 服务类使用装饰器 ====================

class OrderService {
  @auditable({ action: 'create', resource: 'order' })
  async createOrder(data: CreateOrderDto): Promise<Order> {
    // 业务逻辑，审计自动处理
    return await this.orderRepository.create(data)
  }
  
  @auditable({ action: 'update_status', resource: 'order', trackChanges: true })
  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orderRepository.findById(orderId)
    order.status = status
    return await this.orderRepository.save(order)
  }
  
  @auditable({ action: 'cancel', resource: 'order', trackChanges: true })
  async cancelOrder(orderId: string, reason: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId)
    order.status = 'cancelled'
    order.cancelReason = reason
    return await this.orderRepository.save(order)
  }
}

// ==================== React Hook ====================

function useAuditTrail(resource: string, resourceId: string) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await auditLogger.query({
        resource,
        resourceId,
        orderBy: 'timestamp',
        order: 'desc',
      })
      setLogs(data)
    } finally {
      setLoading(false)
    }
  }, [resource, resourceId])
  
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])
  
  return { logs, loading, refresh: fetchLogs }
}

// ==================== 审计日志组件 ====================

function AuditTimeline({ resource, resourceId }: { resource: string; resourceId: string }) {
  const { logs, loading } = useAuditTrail(resource, resourceId)
  
  if (loading) return <div>Loading...</div>
  
  return (
    <div className="space-y-4">
      <h3 className="font-bold">操作记录</h3>
      
      <div className="relative">
        {/* 时间线 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
        
        {logs.map((log, index) => (
          <div key={log.id} className="relative pl-10 pb-4">
            {/* 节点 */}
            <div className={\`absolute left-2 w-4 h-4 rounded-full 
              \${log.result === 'success' ? 'bg-green-500' : 'bg-red-500'}\`}
            />
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{log.action}</span>
                  <span className="text-gray-500 ml-2">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {log.duration}ms
                </span>
              </div>
              
              <div className="text-sm text-gray-500 mt-1">
                操作人: {log.operator.userName} ({log.operator.role})
              </div>
              
              {log.changes.length > 0 && (
                <div className="mt-2 text-sm">
                  {log.changes.map((change, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-medium">{change.field}:</span>
                      <span className="text-red-500">{JSON.stringify(change.oldValue)}</span>
                      <span>→</span>
                      <span className="text-green-500">{JSON.stringify(change.newValue)}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {log.result === 'failed' && (
                <div className="mt-2 text-sm text-red-500">
                  失败原因: {log.errorMessage}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 🎯 核心价值：
// 1. 审计逻辑与业务解耦
// 2. 自动记录操作日志
// 3. 支持变更追踪
// 4. 链路关联便于排查`,
    designPattern: '装饰器模式 + 责任链模式 + 观察者模式'
  },
  {
    id: 'multi-tenant',
    title: '多租户数据隔离',
    subtitle: 'SaaS架构核心设计',
    difficulty: 5,
    tags: ['租户隔离', '上下文传播', '数据路由'],
    category: '企业级场景',
    problem: `SaaS平台的多租户隔离是架构核心：

**场景特征（看到这些就该想到租户上下文）：**

1. **数据隔离** - 不同租户数据严格隔离
2. **个性化配置** - 每个租户独立配置
3. **资源配额** - 租户级别的资源限制
4. **计费统计** - 按租户统计用量
5. **数据迁移** - 租户数据导入导出

**前端挑战：**

- 租户上下文传递
- 租户配置加载
- 租户主题定制
- 跨租户操作控制`,
    badCode: `// ❌ 典型屎山：租户ID到处传
function fetchOrders(tenantId: string) {
  return fetch(\`/api/\${tenantId}/orders\`)
}

function OrderList({ tenantId }: { tenantId: string }) {
  // 问题1: 每个组件都要传tenantId
  const [orders, setOrders] = useState([])
  
  useEffect(() => {
    // 问题2: 每个请求都要带tenantId
    fetchOrders(tenantId).then(setOrders)
  }, [tenantId])
  
  return (
    <div>
      {/* 问题3: 子组件又要继续传 */}
      <OrderFilter tenantId={tenantId} />
      <OrderTable tenantId={tenantId} orders={orders} />
    </div>
  )
}

// 问题4: 没有租户配置管理
// 问题5: 没有租户主题切换
// 问题6: 容易遗漏租户隔离`,
    goodCode: `// ✅ 优雅设计：租户上下文 + 数据路由 + 配置中心

// ==================== 租户模型 ====================

interface Tenant {
  id: string
  name: string
  slug: string              // 租户标识
  plan: 'free' | 'pro' | 'enterprise'
  
  // 配置
  config: TenantConfig
  
  // 配额
  quota: {
    users: number
    storage: number         // MB
    apiCalls: number        // 每月
  }
  
  // 主题
  theme: {
    primaryColor: string
    logo: string
    favicon: string
  }
  
  // 功能开关
  features: Record<string, boolean>
  
  // 状态
  status: 'active' | 'suspended' | 'trial'
  trialEndsAt?: number
}

interface TenantConfig {
  timezone: string
  currency: string
  dateFormat: string
  locale: string
  // ... 业务配置
}

// ==================== 租户上下文 ====================

const TenantContext = createContext<{
  tenant: Tenant | null
  loading: boolean
  switchTenant: (tenantId: string) => Promise<void>
}>({
  tenant: null,
  loading: true,
  switchTenant: async () => {},
})

// 租户Provider
function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 初始化：从域名或localStorage获取租户
  useEffect(() => {
    const tenantSlug = getTenantSlugFromDomain() || localStorage.getItem('tenant_slug')
    if (tenantSlug) {
      loadTenant(tenantSlug)
    } else {
      setLoading(false)
    }
  }, [])
  
  const loadTenant = async (slug: string) => {
    setLoading(true)
    try {
      const data = await fetchTenant(slug)
      setTenant(data)
      applyTenantTheme(data.theme)
      localStorage.setItem('tenant_slug', slug)
    } finally {
      setLoading(false)
    }
  }
  
  const switchTenant = async (tenantId: string) => {
    await loadTenant(tenantId)
  }
  
  return (
    <TenantContext.Provider value={{ tenant, loading, switchTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

// ==================== 租户Hook ====================

function useTenant() {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return context
}

function useTenantRequired() {
  const { tenant, loading } = useTenant()
  if (loading) throw new Promise(() => {})  // Suspense
  if (!tenant) throw new Error('No tenant selected')
  return tenant
}

// ==================== 租户HTTP客户端 ====================

class TenantHttpClient {
  private baseUrl: string
  private tenantGetter: () => string | null
  
  constructor(config: { baseUrl: string; tenantGetter: () => string | null }) {
    this.baseUrl = config.baseUrl
    this.tenantGetter = config.tenantGetter
  }
  
  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const tenantId = this.tenantGetter()
    
    const headers = new Headers(options.headers)
    
    // 自动注入租户头
    if (tenantId) {
      headers.set('X-Tenant-Id', tenantId)
    }
    
    // 添加租户前缀到URL
    const tenantPrefix = tenantId ? \`/t/\${tenantId}\` : ''
    const fullUrl = \`\${this.baseUrl}\${tenantPrefix}\${url}\`
    
    const response = await fetch(fullUrl, {
      ...options,
      headers,
    })
    
    if (!response.ok) {
      throw new ApiError(response.status, await response.text())
    }
    
    return response.json()
  }
  
  get<T>(url: string) {
    return this.request<T>(url, { method: 'GET' })
  }
  
  post<T>(url: string, data: any) {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}

// ==================== 租户数据存储 ====================

class TenantStorage {
  private tenantGetter: () => string | null
  
  constructor(tenantGetter: () => string | null) {
    this.tenantGetter = tenantGetter
  }
  
  private getKey(key: string): string {
    const tenantId = this.tenantGetter()
    return tenantId ? \`tenant:\${tenantId}:\${key}\` : key
  }
  
  get<T>(key: string): T | null {
    const data = localStorage.getItem(this.getKey(key))
    return data ? JSON.parse(data) : null
  }
  
  set<T>(key: string, value: T): void {
    localStorage.setItem(this.getKey(key), JSON.stringify(value))
  }
  
  remove(key: string): void {
    localStorage.removeItem(this.getKey(key))
  }
  
  clearTenantData(): void {
    const tenantId = this.tenantGetter()
    if (!tenantId) return
    
    const prefix = \`tenant:\${tenantId}:\`
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}

// ==================== 租户配额管理 ====================

class TenantQuotaManager {
  private tenant: Tenant
  private usage: Map<string, number> = new Map()
  
  constructor(tenant: Tenant) {
    this.tenant = tenant
  }
  
  // 检查是否超出配额
  canUse(resource: 'users' | 'storage' | 'apiCalls', amount: number = 1): boolean {
    const quota = this.tenant.quota[resource]
    const used = this.usage.get(resource) || 0
    return used + amount <= quota
  }
  
  // 记录使用
  recordUsage(resource: string, amount: number = 1): void {
    const current = this.usage.get(resource) || 0
    this.usage.set(resource, current + amount)
  }
  
  // 获取剩余配额
  getRemaining(resource: string): number {
    const quota = (this.tenant.quota as any)[resource]
    const used = this.usage.get(resource) || 0
    return Math.max(0, quota - used)
  }
  
  // 检查功能是否可用
  hasFeature(feature: string): boolean {
    return this.tenant.features[feature] === true
  }
}

// ==================== 使用示例 ====================

function useTenantApi() {
  const { tenant } = useTenant()
  
  const client = useMemo(() => new TenantHttpClient({
    baseUrl: '/api',
    tenantGetter: () => tenant?.id || null,
  }), [tenant?.id])
  
  return client
}

function OrderList() {
  const tenant = useTenantRequired()
  const api = useTenantApi()
  const quota = useMemo(() => new TenantQuotaManager(tenant), [tenant])
  const [orders, setOrders] = useState([])
  
  // 不需要传租户ID，自动处理
  useEffect(() => {
    api.get('/orders').then(setOrders)
  }, [api])
  
  // 配额检查
  const canCreateOrder = quota.canUse('apiCalls', 1)
  
  // 功能开关
  const canExport = quota.hasFeature('order_export')
  
  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: tenant.theme.primaryColor }}>
        {tenant.name} - 订单列表
      </h1>
      
      {/* 配额提示 */}
      {quota.getRemaining('apiCalls') < 100 && (
        <div className="text-orange-500">
          API调用次数即将用尽，剩余 {quota.getRemaining('apiCalls')} 次
        </div>
      )}
      
      <Table data={orders} />
      
      <div className="flex gap-2">
        <button disabled={!canCreateOrder}>创建订单</button>
        {canExport && <button>导出</button>}
      </div>
    </div>
  )
}

// 应用入口
function App() {
  return (
    <TenantProvider>
      <AppContent />
    </TenantProvider>
  )
}

// 🎯 核心价值：
// 1. 租户上下文自动传播
// 2. 数据隔离自动处理
// 3. 配额管理集中化
// 4. 主题定制自动化`,
    designPattern: '上下文模式 + 数据路由模式 + 策略模式'
  }
]

// ==================== Demo 组件 ====================
const demos: Record<string, () => JSX.Element> = {
  onion: function OnionDemo() {
    return (
    <div className="space-y-4">
      <div className="text-sm text-gray-400">洋葱模型：请求从外到内，响应从内到外</div>
      <div className="relative w-48 h-48 mx-auto">
        {['日志', '埋点', '缓存', '请求'].map((label, i) => (
          <div key={i} className={`absolute rounded-full border-2 flex items-center justify-center
            ${i === 0 ? 'inset-0 border-red-400' : ''}
            ${i === 1 ? 'inset-4 border-yellow-400' : ''}
            ${i === 2 ? 'inset-8 border-green-400' : ''}
            ${i === 3 ? 'inset-12 border-blue-400 bg-blue-900/30' : ''}`}>
            {i === 3 && <span className="text-xs">{label}</span>}
          </div>
        ))}
        <div className="absolute -right-20 top-1/2 text-xs text-gray-400">
          → 请求方向
        </div>
        <div className="absolute -left-20 top-1/2 text-xs text-gray-400">
          ← 响应方向
        </div>
      </div>
      <p className="text-sm text-gray-400">✅ 每层中间件可以：前置处理 → 调用next → 后置处理</p>
    </div>
    )
  },
  ioc: function IocDemo() {
    return (
    <div className="space-y-3 text-sm">
      <div className="text-gray-400">传统方式：组件自己创建依赖</div>
      <div className="bg-red-900/20 p-3 rounded border border-red-500/30">
        <code>const service = new UserService(new Http(), new Cache())</code>
      </div>
      <div className="text-gray-400">IoC方式：容器注入依赖</div>
      <div className="bg-green-900/20 p-3 rounded border border-green-500/30">
        <code>const service = container.resolve(Tokens.UserService)</code>
      </div>
      <p className="text-gray-400">✅ 解耦、易测试、易替换</p>
    </div>
    )
  },
  ratelimit: function RateLimitDemo() {
    const [tokens, setTokens] = useState(5)
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-400">令牌桶：每秒补充令牌，允许突发</div>
        <div className="flex gap-1">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className={`w-8 h-8 rounded ${i < tokens ? 'bg-green-500' : 'bg-gray-700'}`} />
          ))}
        </div>
        <button onClick={() => setTokens(t => Math.max(0, t - 1))} className="px-4 py-2 bg-blue-600 rounded">
          消耗令牌
        </button>
        <button onClick={() => setTokens(5)} className="px-4 py-2 bg-gray-700 rounded ml-2">
          重置
        </button>
        <p className="text-sm text-gray-400">✅ 允许突发流量 + 平滑限流</p>
      </div>
    )
  },
  plugin: function PluginDemo() {
    return (
    <div className="space-y-3">
      <div className="text-sm text-gray-400">插件生命周期</div>
      <div className="flex gap-2">
        {['install', 'activate', 'running', 'deactivate', 'uninstall'].map((s, i) => (
          <div key={s} className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs
              ${i === 2 ? 'bg-green-600' : 'bg-gray-700'}`}>{i + 1}</div>
            <span className="text-xs mt-1">{s}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-400">✅ 宿主稳定，功能通过插件扩展</p>
    </div>
    )
  },
  seckill: function SeckillDemo() {
    const [count, setCount] = useState(10)
    const [status, setStatus] = useState<'countdown' | 'ready' | 'processing'>('countdown')
    
    useEffect(() => {
      if (count > 0) {
        const t = setTimeout(() => setCount(c => c - 1), 1000)
        return () => clearTimeout(t)
      } else {
        setStatus('ready')
      }
    }, [count])
    
    return (
      <div className="space-y-3 text-center">
        {status === 'countdown' && (
          <div className="text-3xl font-bold text-yellow-400">{count}s</div>
        )}
        {status === 'ready' && (
          <button onClick={() => setStatus('processing')} className="px-8 py-4 bg-red-600 rounded-lg text-xl animate-pulse">
            立即抢购
          </button>
        )}
        {status === 'processing' && (
          <div className="text-blue-400">排队中，前方还有 128 人...</div>
        )}
        <p className="text-sm text-gray-400">✅ 服务器时间同步 + 排队机制</p>
      </div>
    )
  },
  realtime: function RealtimeDemo() {
    const [stocks] = useState([
      { symbol: 'AAPL', price: 178.52, change: 2.3 },
      { symbol: 'GOOGL', price: 141.80, change: -0.8 },
      { symbol: 'TSLA', price: 248.50, change: 5.2 },
    ])
    const [connected] = useState(true)
    
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs">{connected ? 'WebSocket 已连接' : '断线重连中...'}</span>
        </div>
        <div className="space-y-1">
          {stocks.map(s => (
            <div key={s.symbol} className="flex justify-between text-sm">
              <span>{s.symbol}</span>
              <span className={s.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${s.price} ({s.change >= 0 ? '+' : ''}{s.change}%)
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">✅ 心跳检测 + 断线重连 + 批量更新</p>
      </div>
    )
  },
  'sku-selector': function SkuSelectorDemo() {
    const [selected, setSelected] = useState<Record<string, string>>({})
    const specs = [
      { id: 'color', name: '颜色', values: ['红', '蓝', '黑'] },
      { id: 'size', name: '尺寸', values: ['S', 'M', 'L'] },
    ]
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">SKU选择器：动态计算可选路径</div>
        {specs.map(spec => (
          <div key={spec.id} className="space-y-2">
            <div className="text-sm font-medium">{spec.name}</div>
            <div className="flex gap-2">
              {spec.values.map(v => (
                <button
                  key={v}
                  onClick={() => setSelected(s => ({ ...s, [spec.id]: s[spec.id] === v ? '' : v }))}
                  className={`px-3 py-1 rounded border text-sm
                    ${selected[spec.id] === v 
                      ? 'border-blue-500 bg-blue-900/30' 
                      : 'border-gray-600 hover:border-gray-400'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-sm text-gray-400">
          已选: {Object.values(selected).filter(Boolean).join(' / ') || '未选择'}
        </div>
        <p className="text-sm text-gray-400">✅ 图论路径搜索 + 状态矩阵</p>
      </div>
    )
  },
  'coupon-stack': function CouponStackDemo() {
    const [coupons, setCoupons] = useState<string[]>([])
    const couponList = [
      { id: 'full', name: '满100减20', type: '满减' },
      { id: 'discount', name: '8折券', type: '折扣' },
      { id: 'shipping', name: '包邮券', type: '运费' },
    ]
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">选择优惠券（自动判断互斥/叠加）</div>
        <div className="space-y-2">
          {couponList.map(c => (
            <button
              key={c.id}
              onClick={() => setCoupons(cs => cs.includes(c.id) ? cs.filter(x => x !== c.id) : [...cs, c.id])}
              className={`w-full p-2 rounded border text-left text-sm
                ${coupons.includes(c.id) 
                  ? 'border-green-500 bg-green-900/30' 
                  : 'border-gray-600 hover:border-gray-400'}`}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-400 ml-2">({c.type})</span>
            </button>
          ))}
        </div>
        <div className="text-sm">
          已选 {coupons.length} 张，预计优惠 ¥{coupons.length * 20}
        </div>
        <p className="text-sm text-gray-400">✅ 规则引擎 + 策略模式</p>
      </div>
    )
  },
  'inventory-lock': function InventoryLockDemo() {
    const [stock, setStock] = useState(10)
    const [locked, setLocked] = useState(0)
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">库存预占演示</div>
        <div className="flex gap-4 items-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{stock - locked}</div>
            <div className="text-xs text-gray-400">可购买</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{locked}</div>
            <div className="text-xs text-gray-400">预占中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{stock}</div>
            <div className="text-xs text-gray-400">总库存</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLocked(l => Math.min(l + 1, stock))} 
            className="px-4 py-2 bg-blue-600 rounded text-sm">
            锁定1件
          </button>
          <button onClick={() => { setStock(s => s - locked); setLocked(0) }}
            className="px-4 py-2 bg-green-600 rounded text-sm" disabled={locked === 0}>
            确认购买
          </button>
          <button onClick={() => setLocked(0)}
            className="px-4 py-2 bg-gray-600 rounded text-sm" disabled={locked === 0}>
            释放库存
          </button>
        </div>
        <p className="text-sm text-gray-400">✅ 乐观锁 + 超时自动释放</p>
      </div>
    )
  },
  'account-freeze': function AccountFreezeDemo() {
    const [balance, setBalance] = useState(1000)
    const [frozen, setFrozen] = useState(0)
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">账户余额操作演示</div>
        <div className="p-4 bg-gray-800 rounded-lg space-y-2">
          <div className="flex justify-between">
            <span>可用余额</span>
            <span className="text-green-400 font-bold">¥{balance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>冻结金额</span>
            <span className="text-orange-400">¥{frozen.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-2">
            <span>总资产</span>
            <span>¥{(balance + frozen).toFixed(2)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setBalance(b => b - 100); setFrozen(f => f + 100) }}
            className="px-3 py-1 bg-blue-600 rounded text-sm" disabled={balance < 100}>
            冻结¥100
          </button>
          <button onClick={() => { setFrozen(0) }}
            className="px-3 py-1 bg-gray-600 rounded text-sm" disabled={frozen === 0}>
            解冻全部
          </button>
          <button onClick={() => { setFrozen(0) }}
            className="px-3 py-1 bg-green-600 rounded text-sm" disabled={frozen === 0}>
            扣款确认
          </button>
        </div>
        <p className="text-sm text-gray-400">✅ 状态机 + 幂等性保证</p>
      </div>
    )
  },
  'distributed-id': function DistributedIdDemo() {
    const [ids, setIds] = useState<string[]>([])
    
    const generateId = () => {
      const timestamp = Date.now()
      const random = Math.random().toString(36).slice(2, 6)
      return `ORD${timestamp}${random}`.toUpperCase()
    }
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">雪花算法ID生成演示</div>
        <button onClick={() => setIds(ids => [generateId(), ...ids.slice(0, 5)])}
          className="px-4 py-2 bg-blue-600 rounded">
          生成ID
        </button>
        <div className="space-y-1">
          {ids.map((id, i) => (
            <div key={i} className="text-sm font-mono bg-gray-800 p-2 rounded">
              {id}
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400">
          时间戳(41bit) + 机器ID(10bit) + 序列号(12bit)
        </div>
        <p className="text-sm text-gray-400">✅ 全局唯一 + 时间有序</p>
      </div>
    )
  },
  'quote-merge': function QuoteMergeDemo() {
    const [updates, setUpdates] = useState(0)
    const [renders, setRenders] = useState(0)
    
    useEffect(() => {
      const timer = setInterval(() => {
        setUpdates(u => u + Math.floor(Math.random() * 10) + 1)
      }, 100)
      return () => clearInterval(timer)
    }, [])
    
    useEffect(() => {
      const timer = setInterval(() => {
        setRenders(r => r + 1)
      }, 50)
      return () => clearInterval(timer)
    }, [])
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">高频数据合并演示</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-red-900/20 rounded">
            <div className="text-2xl font-bold text-red-400">{updates}</div>
            <div className="text-xs text-gray-400">推送次数/秒</div>
          </div>
          <div className="text-center p-4 bg-green-900/20 rounded">
            <div className="text-2xl font-bold text-green-400">{renders}</div>
            <div className="text-xs text-gray-400">渲染次数/秒</div>
          </div>
        </div>
        <div className="text-sm text-gray-400">
          推送:渲染比例 ≈ 2:1（合并后减少50%渲染）
        </div>
        <p className="text-sm text-gray-400">✅ 数据合并 + 批量更新</p>
      </div>
    )
  },
  'data-permission': function DataPermissionDemo() {
    const [role, setRole] = useState<'admin' | 'manager' | 'sales'>('sales')
    
    const permissions = {
      admin: { scope: '全部数据', fields: '全部字段', masked: '无' },
      manager: { scope: '部门数据', fields: '全部字段', masked: '手机号' },
      sales: { scope: '个人数据', fields: '部分字段', masked: '手机号/邮箱/身份证' },
    }
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">数据权限过滤演示</div>
        <div className="flex gap-2">
          {(['admin', 'manager', 'sales'] as const).map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`px-4 py-2 rounded text-sm
                ${role === r ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {r === 'admin' ? '管理员' : r === 'manager' ? '经理' : '销售'}
            </button>
          ))}
        </div>
        <div className="p-4 bg-gray-800 rounded space-y-2 text-sm">
          <div className="flex justify-between">
            <span>数据范围</span>
            <span className="text-blue-400">{permissions[role].scope}</span>
          </div>
          <div className="flex justify-between">
            <span>可见字段</span>
            <span className="text-green-400">{permissions[role].fields}</span>
          </div>
          <div className="flex justify-between">
            <span>脱敏字段</span>
            <span className="text-orange-400">{permissions[role].masked}</span>
          </div>
        </div>
        <p className="text-sm text-gray-400">✅ 策略模式 + AOP切面</p>
      </div>
    )
  },
  'audit-trail': function AuditTrailDemo() {
    const [logs, setLogs] = useState<{action: string; time: string; user: string}[]>([])
    
    const addLog = (action: string) => {
      setLogs(logs => [{
        action,
        time: new Date().toLocaleTimeString(),
        user: '当前用户'
      }, ...logs].slice(0, 5))
    }
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">操作审计追踪演示</div>
        <div className="flex gap-2">
          <button onClick={() => addLog('创建订单')} className="px-3 py-1 bg-blue-600 rounded text-sm">创建</button>
          <button onClick={() => addLog('修改价格')} className="px-3 py-1 bg-yellow-600 rounded text-sm">修改</button>
          <button onClick={() => addLog('删除订单')} className="px-3 py-1 bg-red-600 rounded text-sm">删除</button>
          <button onClick={() => addLog('导出数据')} className="px-3 py-1 bg-gray-600 rounded text-sm">导出</button>
        </div>
        <div className="space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex justify-between text-sm p-2 bg-gray-800 rounded">
              <span>{log.action}</span>
              <span className="text-gray-400">{log.time} - {log.user}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-sm text-gray-500">暂无操作记录</div>}
        </div>
        <p className="text-sm text-gray-400">✅ 装饰器模式 + 链路追踪</p>
      </div>
    )
  },
  'multi-tenant': function MultiTenantDemo() {
    const [tenant, setTenant] = useState<'A' | 'B' | 'C'>('A')
    
    const tenants = {
      A: { name: '企业A', color: '#3b82f6', users: 100, storage: '50GB' },
      B: { name: '企业B', color: '#10b981', users: 50, storage: '30GB' },
      C: { name: '企业C', color: '#f59e0b', users: 20, storage: '10GB' },
    }
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">多租户隔离演示</div>
        <div className="flex gap-2">
          {(['A', 'B', 'C'] as const).map(t => (
            <button key={t} onClick={() => setTenant(t)}
              style={{ backgroundColor: tenant === t ? tenants[t].color : '#374151' }}
              className="px-4 py-2 rounded text-sm text-white">
              租户{t}
            </button>
          ))}
        </div>
        <div className="p-4 rounded" style={{ backgroundColor: `${tenants[tenant].color}20` }}>
          <div className="font-bold text-lg" style={{ color: tenants[tenant].color }}>
            {tenants[tenant].name}
          </div>
          <div className="text-sm text-gray-400 mt-2">
            用户数: {tenants[tenant].users} | 存储: {tenants[tenant].storage}
          </div>
        </div>
        <p className="text-sm text-gray-400">✅ 上下文传播 + 数据路由</p>
      </div>
    )
  },
  default: () => <div className="text-gray-400 text-sm">详细代码请查看「优雅设计」标签</div>
}

// ==================== 主组件 ====================
export default function Home() {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('onion')
  const [activeTab, setActiveTab] = useState<TabType>('problem')

  const scenario = scenarios.find(s => s.id === activeScenario)!
  
  // 按类别分组
  const categories = useMemo(() => {
    const groups: Record<string, Scenario[]> = {}
    scenarios.forEach(s => {
      const cat = s.category || '其他'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(s)
    })
    return groups
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex">
      {/* 左侧导航 */}
      <aside className="w-72 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            高级前端架构设计
          </h1>
          <p className="text-xs text-gray-500 mt-1">经典模式 × 领域场景</p>
        </div>

        <nav className="flex-1 overflow-auto p-2 space-y-1">
          {Object.entries(categories).map(([cat, items]) => (
            <div key={cat}>
              <div className={`px-2 py-1 text-xs font-medium ${
                cat === '架构模式' ? 'text-purple-400' :
                cat === '电商领域' ? 'text-blue-400' :
                cat === '金融领域' ? 'text-green-400' :
                cat === '企业级场景' ? 'text-orange-400' :
                'text-gray-400'
              }`}>
                {cat === '架构模式' && '🏗️ '}
                {cat === '电商领域' && '🛒 '}
                {cat === '金融领域' && '💰 '}
                {cat === '企业级场景' && '🏢 '}
                {cat}
              </div>
              {items.map(s => (
                <button key={s.id} onClick={() => { setActiveScenario(s.id); setActiveTab('problem') }}
                  className={`w-full text-left p-2 rounded text-sm transition-all ${
                    activeScenario === s.id 
                      ? 'bg-blue-600/20 border border-blue-500/50 text-white' 
                      : 'hover:bg-gray-800 text-gray-400'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span>{s.title}</span>
                    <span className="text-xs opacity-50">{'💩'.repeat(Math.min(s.difficulty, 5))}</span>
                  </div>
                  <div className="text-xs text-gray-500">{s.subtitle}</div>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Tab 导航 */}
        <div className="border-b border-gray-800 flex">
          {[
            { id: 'problem' as const, label: '📋 问题分析' },
            { id: 'bad' as const, label: '💩 烂代码' },
            { id: 'good' as const, label: '✨ 优雅设计' },
            { id: 'demo' as const, label: '🎮 Demo' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm transition-all border-b-2 ${
                activeTab === tab.id ? 'border-blue-500 bg-gray-800/50' : 'border-transparent hover:bg-gray-800/30'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'problem' && (
            <div className="space-y-4">
              <div className="inline-block px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                易屎山指数：{'💩'.repeat(Math.min(scenario.difficulty, 5))}
              </div>
              <pre className="whitespace-pre-wrap text-gray-300 leading-relaxed bg-gray-800 p-4 rounded-lg text-sm overflow-auto">
                {scenario.problem}
              </pre>
              <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <span className="font-medium text-blue-400">🎯 设计模式：</span>
                <span className="text-gray-300 ml-2">{scenario.designPattern}</span>
              </div>
            </div>
          )}

          {activeTab === 'bad' && <CodeBlock code={scenario.badCode} type="bad" />}
          {activeTab === 'good' && <CodeBlock code={scenario.goodCode} type="good" />}
          
          {activeTab === 'demo' && (
            <div className="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
              {(demos[activeScenario] || demos.default)()}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
