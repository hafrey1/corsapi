# API 中转代理服务

一个基于 Cloudflare Workers / Pages Functions 的通用 API 中转代理服务。

支持：

* 任意 API 请求中转
* JSON 配置订阅输出
* Base58 编码输出
* Cloudflare KV + 内存双层缓存
* 自动 CORS
* 自定义代理前缀
* 多配置源切换
* Workers 与 Pages Functions 通用

---

# 功能特性

* 支持 GET、POST、PUT、DELETE、OPTIONS 等 HTTP 方法
* 自动透传请求头与请求体
* 自动过滤敏感响应头
* 防止自身递归调用
* 请求超时保护（9 秒）
* Worker 内存缓存
* Cloudflare KV 持久缓存
* 支持 JSON / Base58 两种输出格式
* 支持代理前缀自动替换
* 支持自定义配置源

---

# 项目结构

```tree
.
├── worker.js
├── wrangler.toml
├── package.json
└── README.md
```

---

# 部署方式

## 方案一：Cloudflare Workers

### 1. 创建项目

```bash
mkdir cf-proxy-service
cd cf-proxy-service
npm init -y
```

### 2. 安装 Wrangler

```bash
npm install -D wrangler
```

### 3. 创建 worker.js

将你的代码保存为：

```bash
/worker.js
```

### 4. 创建 wrangler.toml

```toml
name = "cf-proxy-service"
main = "worker.js"
compatibility_date = "2026-03-30"
workers_dev = true

[[kv_namespaces]]
binding = "KV"
id = "你的KV命名空间ID"
preview_id = "你的KV预览命名空间ID"
```

### 5. 登录 Cloudflare

```bash
npx wrangler login
```

### 6. 创建 KV 命名空间

```bash
npx wrangler kv namespace create KV
npx wrangler kv namespace create KV --preview
```

创建后，把返回的 id 填入 wrangler.toml。

### 7. 本地开发

```bash
npx wrangler dev
```

默认会启动在：

```text
http://127.0.0.1:8787
```

### 8. 发布上线

```bash
npx wrangler deploy
```

---

## 方案二：Cloudflare Pages Functions

### 1. 项目结构

```tree
.
├── functions
│   └── [[path]].js
├── public
│   └── index.html
├── wrangler.toml
└── package.json
```

### 2. 文件路径

把你的代码保存到：

```bash
/functions/[[path]].js
```

### 3. wrangler.toml

```toml
name = "cf-pages-proxy"
compatibility_date = "2026-03-30"
pages_build_output_dir = "public"

[[kv_namespaces]]
binding = "KV"
id = "你的KV命名空间ID"
preview_id = "你的KV预览命名空间ID"
```

### 4. 本地开发

```bash
npx wrangler pages dev public
```

### 5. 发布

推送到 GitHub 后，在 Cloudflare Pages 中连接仓库即可自动部署。

---

# package.json

```json
{
  "name": "cf-proxy-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4.8.0"
  }
}
```

---

# 环境变量

当前项目不依赖额外环境变量。

仅需要绑定：

```text
KV
```

---

# API 使用说明

## 1. 健康检查

```http
GET /health
```

示例：

```bash
curl https://your-domain.com/health
```

返回：

```text
OK
```

---

## 2. 通用代理

请求方式：

```http
GET /?url=https://example.com/api/data
```

示例：

```bash
curl "https://your-domain.com/?url=https://jsonplaceholder.typicode.com/posts/1"
```

POST 示例：

```bash
curl -X POST "https://your-domain.com/?url=https://httpbin.org/post" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'
```

---

## 3. JSON 配置输出

### format 参数

| 参数值          | 说明          |
| ------------ | ----------- |
| 0            | 原始 JSON     |
| raw          | 原始 JSON     |
| 1            | 添加代理前缀      |
| proxy        | 添加代理前缀      |
| 2            | Base58 编码   |
| base58       | Base58 编码   |
| 3            | 代理 + Base58 |
| proxy-base58 | 代理 + Base58 |

### source 参数

| 参数值      | 说明      |
| -------- | ------- |
| jin18    | 精简版     |
| jingjian | 精简版+成人  |
| full     | 完整版（默认） |

---

# 配置示例

## 原始 JSON

```bash
curl "https://your-domain.com/?format=0&source=full"
```

## 代理 JSON

```bash
curl "https://your-domain.com/?format=1&source=full"
```

## Base58

```bash
curl "https://your-domain.com/?format=2&source=full"
```

## 代理 + Base58

```bash
curl "https://your-domain.com/?format=3&source=full"
```

## 自定义前缀

```bash
curl "https://your-domain.com/?format=1&source=full&prefix=https://proxy.example.com/?url="
```

---

# 缓存策略

项目采用双层缓存：

## Worker 内存缓存

* 缓存时间：5 分钟
* 同一个 Worker 实例共享
* 响应速度最快

## Cloudflare KV 缓存

* 缓存时间：30 分钟
* 跨 Worker 实例共享
* 减少 GitHub Raw 请求次数

缓存读取顺序：

```text
内存缓存 -> KV 缓存 -> 源站请求
```

---

# 错误响应格式

所有错误都会返回统一 JSON：

```json
{
  "success": false,
  "error": "错误信息",
  "details": {},
  "timestamp": "2026-03-30T12:00:00.000Z"
}
```

---

# 安全限制

项目内置以下保护：

* 禁止代理请求自身域名，防止死循环
* 禁止非 http / https URL
* 自动移除敏感响应头
* 自动超时终止请求
* 不透传 Set-Cookie

---

# 性能优化建议

## 推荐优化

1. 给 fetch 增加 cf cacheEverything 与 cacheTtl
2. 增加 URL 白名单
3. 增加请求频率限制
4. 增加日志系统
5. 增加监控告警
6. 增加 gzip / brotli 压缩
7. 增加多源容灾

---

# 后续可扩展功能

* IP 黑名单
* Token 鉴权
* 请求次数统计
* 管理后台
* 动态配置源
* Web UI 面板
* 限流系统
* 数据分析

---

# License

MIT
