# 固定文本模型 API Host 设计

## 目标

将当前 10 个启用的文本模型的后端请求地址统一固定为 `https://api.aittco.com`。固定只针对文本模型请求，不改变图片模型、视频模型或其他未纳入当前文本目录的模型。

## 范围

目标模型目录来自 `CHAT_MODEL_CATALOG`：

- Gemini：`gemini-3.5-flash-preview`、`gemini-3.7-flash`、`gemini-3.1-pro-preview`
- OpenAI：`gpt-5.5`、`gpt-5.6-terra`、`gpt-5.6-sol`
- Anthropic：`claude-opus-4-8`、`claude-sonnet-5`、`claude-opus-5`
- xAI：`grok-4.6`

模型请求的 Host 必须为：

```text
https://api.aittco.com
```

API Key 的读取和校验逻辑保持现状，不在本次变更中合并供应商密钥。

## 设计

### 统一模型识别

在共享模型目录模块中提供固定 Host 常量及模型识别辅助函数。识别时兼容模型 ID 的供应商前缀（例如 `openai/`、`anthropic/`、`googleai/`、`xai/`），但只匹配当前 10 个规范模型，不按字符串中是否包含 `gpt`、`claude` 等模糊判断。

### 访问层强制 Host

在 Gemini、OpenAI/xAI、Anthropic 的实际请求构造层使用该辅助函数：

1. 请求模型属于当前 10 个文本模型时，忽略访问对象中的自定义 Host、供应商 Host 环境变量和默认官方 Host，改用固定 Host。
2. OpenAI 和 xAI 保留各自协议及路径；Claude 保留 Anthropic `/v1/messages` 协议；Gemini 保留 Gemini `/v1beta/models/...` 协议。
3. 非目标模型请求保持现有 Host 优先级和行为。
4. 图片/视频请求不调用文本固定 Host 逻辑，继续使用现有模型路由配置。

Anthropic 的请求选项增加明确的模型路由字段，避免用 Beta 功能字段间接推断模型。聊天分发层传入当前模型 ID；模型列表、Skills 和文件 API 等没有具体聊天模型的请求不强制套用文本 Host。

### 错误处理

固定 Host 不改变认证信息。如果 API Key 含中文或其他非法 Header 字符，仍应由现有请求层返回认证配置错误；如果上游返回 401，则提示检查对应供应商/中转站 Token。不得在日志中输出完整密钥。

## 测试

新增或扩展自动化测试，覆盖：

- 10 个规范模型（含前缀形式）均解析到 `https://api.aittco.com`。
- 自定义 Host 和供应商环境 Host 不能覆盖目标文本模型的固定 Host。
- 非目标文本模型继续使用传入/环境 Host。
- 图片和视频路由不使用文本固定 Host。
- OpenAI、xAI、Anthropic、Gemini 的协议路径仍保持正确。

## 发布与回滚

发布时重新构建前端镜像并重建前端容器。数据库模型目录同步命令保持不变。若需要回滚，只需回退本次代码提交并重新构建镜像；数据库中的模型价格和启用状态不受本功能影响。
