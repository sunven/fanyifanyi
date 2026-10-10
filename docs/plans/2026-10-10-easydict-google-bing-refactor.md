# 参考 Easydict 重构 Google 与必应文本翻译

## 目标与边界

依据固定上游提交 `cfda6e2f43741a3210a290e422846f1d83742d38` 的文本翻译协议，整理 Rust 请求层并修复段落丢失。研究证据见 [调研笔记](../research/easydict-google-bing.md)。

- 保持 `translate_with_google`、`translate_with_microsoft` 命令、参数、字符串结果，以及现有 `google` / `microsoft` 配置兼容。
- 翻译方向继续由 `src/lib/translate.ts` 决定；各入口通过同一适配器使用新实现。
- 范围是文本翻译，不扩展词典、发音、设置界面，不增加依赖。

## 实施顺序与验证

1. 跑现有测试并补齐请求与错误边界的回归测试，再移动实现。
   - 已有基线：23 项翻译模块前端测试通过；Rust 74 项通过、1 项原有 OCR 测试忽略。
   - 锁定空输入、目标语言、完整原文编码、HTTP 错误、Google 429 最多重试两次。
2. 将两个供应商的 HTTP、解析及认证状态集中到 Rust 文本翻译模块，Tauri 命令仅转发。
   - 复用一个有超时的 HTTP client；以本地 HTTP 服务器验证真实请求，测试无需外网。网页请求使用 HTTP/1.1：本次相同端点、参数和 User-Agent 的 Rust 对照中，HTTP/2 返回 429，而 HTTP/1.1 返回 200；这是本项目的兼容处理。
   - Google 使用上游 `translate.google.com/translate_a/single` GTX 参数与浏览器 User-Agent；直接拼接 `sentences[].trans`，保留服务端空白与换行，拒绝空结果。
   - 必应改用 HTTPS `/translator` 获取 IG、IID、key、token、有效期，再表单 POST `/ttranslatev3`；沿用页面最终重定向主机。
   - 必应中文代码转换为 `zh-Hans` / `zh-Hant`，自动检测用 `auto-detect`。
   - token 仅在内存缓存，按 key 时间戳和半个有效期提前失效；并发获取共享同一次刷新，旧请求不能清除较新的凭证。
   - JSON `statusCode=205` 最多触发一次重新取 token；HTTP 429、普通 HTTP 错误、格式错误应明确失败。
3. 保留长文本能力，不照搬 Easydict 静默截断。
   - 必应页面当前标注 `maxlength=1000`，这不是已经验证的 API 硬上限。本项目选择按至多 1000 个 UTF-16 单位分段，优先在空白处分割并保留分隔符；逐段翻译，共用缓存。没有空白时硬切，并用换行连接译文以避免英文词粘连。
   - 任一段失败时返回错误，避免将缺少后文的部分译文当作完整结果。
   - 覆盖中文、emoji、特殊表单字符、多段及空白，确认原文没有遗漏。
4. 运行针对性测试、完整 Rust / 前端测试、TypeScript 构建、ESLint、Rust 格式及 Clippy 检查。
   - 用不含用户信息的固定例句做真实 Google / 必应请求，记录当前网络结果；不把在线可用性写成永久保证。

## 取舍

- Google 只需要 GTX 文本分支；不引入 webapp 词典签名、TKK 抓取或 JavaScript 执行。
- 必应迁移网页协议后删除原有 Edge JWT 路径，避免维护两套认证流程；配置标识仍保留 `microsoft`。
- 缓存不落盘，不新增 Cookie 配置；复用 HTTP client 的 Cookie 会话。
- 网页接口不是稳定的官方第三方 API 合约。保留可诊断错误，并用固定协议样例和本地服务测试约束适配器。

## 审阅

计划由主代理撰写；研究代理独立审阅后确认无阻塞项。实施前采纳了网页长度与 API 上限的区分，并补入旧凭证失效、UTF-16 边界、第二次 205、后段失败的测试要求。Cookie 支持已在现有 `tauri-plugin-http` 默认 features 中确认。

## 完成与验证

- 请求实现位于 `src-tauri/src/web_translation.rs`，`lib.rs` 只保留原有命令的转发与共享状态注册。删除旧 Edge JWT 实现及不再使用的 `urlencoding` 依赖，没有新增依赖。
- `src-tauri/src/web_translation/tests.rs` 的 20 项离线测试通过；完整 Rust 测试 89 项通过，2 项按默认规则忽略（原有 OCR 手动测试与单独运行的真实翻译冒烟）。前端 231 项测试通过。
- 单独执行 `cargo test --lib web_translation::tests::live_web_translation_smoke -- --ignored --nocapture` 通过：Google 返回 `你好世界。\n早上好。`，必应返回 `你好，世界。\n早上好。`。
- `pnpm build`、`cargo clippy --all-targets -- -D warnings`、新 Rust 模块的格式检查及 `git diff --check` 通过。临时 HTTP 版本诊断代码已删除。
- 全仓库 ESLint 存在原有源文件、配置和生成文件的格式问题；全仓库 Rust 格式检查存在原有 OCR / AI 测试的格式问题，已与原始 HEAD 对照确认。新文档单独通过 ESLint，未扩大本次修改去整理无关文件。
