# Easydict Google 与必应翻译接入调研

调研日期：2026-10-10。上游源码固定到提交 `cfda6e2f43741a3210a290e422846f1d83742d38`，经 `git ls-remote ... HEAD` 与浅克隆核对一致。该提交的提交者时间为 `2026-10-01T01:27:07+08:00`。
本地比较基线为 `3aab370fe2eb31a6f1680049e0a544f765b97f38`。以下区分上游实现事实、对本项目的建议和本次网络验证；没有运行 Easydict，真实网络结果来自主代理在本次任务中执行的 Python 探测与 Rust 冒烟测试。

## 结论

Google 的普通文本路径是 **GET `https://translate.google.com/translate_a/single`，`client=gtx`**。词典查询另走相同主机的 `client=webapp` 路径；二者不是统一的主备网络回退链。Bing 使用 **必应网页的临时 key/token 与 `/ttranslatev3` 表单接口**，不是本项目比较基线中的 Edge bearer token 路径。[Google 入口][google-entry]、[GTX 请求][google-gtx-request]、[Bing 请求][bing-request]

对当前只返回译文字符串的调用契约，最小迁移建议是：Google 保留 GTX、改用上游主机并保留服务端分段空白；Microsoft 的内部实现改为 Bing 网页协议，补齐 token 缓存与一次失效刷新，将 `zh-CN` 映射成 `zh-Hans`。维持现有 `translate_with_google`、`translate_with_microsoft` 命令和前端翻译方向策略。无需为了这项重构接入 Google WebApp 签名、词典、TTS 或新依赖。

本次重构已将这两条文本路径落到 [Rust 实现](../../src-tauri/src/web_translation.rs)，最终真实网络冒烟两家均成功并保留换行。本项目根据当前 Rust 客户端与网络组合的差分测试选择 HTTP/1.1，解决了本次 Google 请求的 429；具体证据和适用边界见“本次网络验证”。

```text
Google 普通文本 ─→ GET translate.google.com/translate_a/single?client=gtx
                ← sentences[].trans 顺序直接拼接

Bing 普通文本 ─→ GET <bing host>/translator（缓存无效时）
                 解析 IG / IID / [key, token, expirationInterval]
              ─→ POST <bing host>/ttranslatev3?isVertical=1&IG=...&IID=...
                ← 第一个翻译模型的 translations[].text
                 JSON statusCode=205 → 重取 token，最多重试一次
```

图示省略了上游 Bing 的词典并发分支和主机发现；这些不是本项目输出普通译文的必要步骤。

## Google：普通文本与词典是两种请求

### 路由与端点

`GoogleService.defaultTranslateURL` 固定为 `https://translate.google.com`。`translate` 先处理长度，再调用 `shouldQueryDictionary(withLanguage:maxWordCount: 1)`，符合词典条件时调用 `webAppTranslate`，其他情况调用 `gtxTranslate`。[主机与入口][google-entry]

词典条件不等于“任意语言的短文本”：中文还受字符数量和分词条件限制，英文要求单词数为 1 且不超过内部最大单词长度，其他语言返回 false。[词典判定][dictionary-condition]

GTX 的参数如下。虽然请求函数也计算了 `sign`，但 **GTX 请求参数没有 `tk`**；该返回值供后续语音 URL 使用，普通译文请求不依赖签名。[GTX 请求][google-gtx-request]、[GTX 结果处理][google-gtx-response]

```text
GET https://translate.google.com/translate_a/single
q=<原文>&sl=<来源语言>&tl=<目标语言>
&dt=t&dj=1&ie=UTF-8&client=gtx
```

Google HTML/JSON 请求共用 GET 请求器，设置源码内的 Chrome 77 桌面 User-Agent、15 秒超时并验证 HTTP 状态为 2xx；所查普通翻译请求器没有限流重试或备用主机逻辑。[公共请求器][google-http]、[超时常量][constants]

### GTX 响应与空白

GTX 读取响应对象的 `src` 和 `sentences[].trans`。各段 `trans` **不逐段 trim，也不插入空格**，而是 `translationArray.joined()`，再用 `toParagraphs()` 按 `\n` 拆成段落。后者只是 `components(separatedBy: "\n")`，没有删除空段落。[GTX 解析][google-gtx-response]、[分段工具][paragraphs]

因此，本项目若仍输出单个字符串，可以直接拼接原始 `trans`；原文中由服务端返回的中文标点、句间空格和 `\n\n` 不应被统一替换成一个空格。这是由解析差异得出的迁移建议，不代表两种域名对所有输入的译文完全相同。

网络失败、HTTP 非 2xx、缺少响应数据和 JSON 解码失败都会返回错误；取消单独转为 `CancellationError`。服务层只有在结果对象含有词典或翻译字段时返回成功，否则报 API 错误。[GTX 请求错误][google-gtx-request]、[GTX 解析][google-gtx-response]

### WebApp 签名与真实回退边界

WebApp 也请求 `/translate_a/single`，使用多个重复的 `dt` 参数：`at/bd/ex/ld/md/qca/rw/rm/ss/t`；其余参数是 `client=webapp`、`sl`、`tl`、`hl=en`、`otf=2`、`ssel=3`、`tsel=0`、`kc=6`、`tk=<签名>`、`q=<原文>`。[WebApp 请求][google-webapp-request]

签名由随应用打包的 JavaScript 执行，输入文字按 UTF-8 对应字节处理，与 TKK 两部分进行 32 位移位、异或、加法，再取模 `1e6`，输出两个数字以点分隔。脚本内置初始 `TKK='444000.1270171236'`，并把首次读取的 TKK 保存在 `yr` 中；这不是用户申请的 API key。[脚本加载][google-entry]、[签名源码][google-sign]

仓库还有获取主页 `tkk:'数字.数字',` 的函数，以及按当前小时检查 TKK 的更新函数；主页没找到新值时可回用已有 `window.TKK`。但当前文本翻译入口没有先调用这个更新函数，明确调用它的是非英文 TTS 路径。不能据“存在 TKK 更新函数”推断每次文本翻译会刷新签名。[TKK 处理][google-tkk]、[文本入口][google-entry]、[TTS 调用][google-tts-entry]

WebApp 响应是嵌套数组：`[2]` 是来源语言；`[0]` 包含译文和音标数据；`[1]` 可包含词性与释义。普通译文从 `[0]` 各子数组的第一个字符串提取，逐段 trim 并过滤空内容。[WebApp 解析][google-webapp-response]、[WebApp 译文][google-webapp-text]

回退有明确限制：WebApp 发生网络或解析错误时直接返回错误；成功获得响应、但没有生成词典或译文结果时，才调用 GTX。GTX 没有反向回退 WebApp。[WebApp 错误与回退][google-webapp-response]、[GTX 结果][google-gtx-response]

仓库内的 `batchexecute` 与 `rpcids=jQ1olc` 属于英文 TTS，使用 `.google.as` 或 `.google.co.uk` 区分口音；不是该提交的 Google 文本翻译主备路径。[TTS RPC][google-tts-rpc]

## Bing：网页配置、表单请求与有限重试

### 主机发现与 token 来源

`BingRequest` 初始化时从 `UserDefaults` 加载 `BingConfig`。没有已缓存主机时，上游 GET `http://cn.bing.com`，取最终响应 URL 的 host；非取消类错误时回用 `cn.bing.com`。后续译者页面地址是 `https://<host>/translator`。[初始化][bing-init]、[主机发现][bing-host]、[URL 配置][bing-config-urls]

配置过期后，GET 译者页面并从 HTML 提取以下字段；任一必需字段缺失即失败。[配置请求][bing-fetch-config]、[提取器][bing-regex]

| 字段                 | 上游提取来源                               | 用途                                  |
| -------------------- | ------------------------------------------ | ------------------------------------- |
| `IG`                 | `IG:"..."`                                 | 翻译 URL 查询参数                     |
| `IID`                | `data-iid="..."`                           | 翻译 URL 查询参数                     |
| `key`                | `params_AbusePreventionHelper` 数组第 1 项 | 表单字段；同时作 token 起始毫秒时间戳 |
| `token`              | 同数组第 2 项                              | 表单字段；不是 JWT / bearer header    |
| `expirationInterval` | 同数组第 3 项                              | 毫秒有效时间，用于客户端提前刷新      |

上游正则只提取字符串：数组内部移除双引号后按逗号切分，要求得到 3 项。移植到 Rust 时可复用 `serde_json` 解析截取的数组，以核对字段类型、处理 JSON 转义；这是更适合现有依赖的实现建议。[提取器][bing-regex]

### 缓存与过期

上游持久化 `host/IG/IID/key/token/expirationInterval`，缓存的 `key` 缺失时视作过期。其过期计算为：[过期算法][bing-expiry]、[持久化][bing-persistence]

```text
tokenStart = Double(key) 或 0
ttlMs      = Double(expirationInterval) 或 3_600_000
expired    = nowUnixMs - tokenStart > ttlMs / 2
```

默认值对应 60 分钟有效期、使用约 30 分钟后主动刷新；这是上游按页面参数采取的缓存策略，不能作为服务端始终承诺的有效期。[过期算法][bing-expiry]

`resetToken` 清空 token 相关字段，保留 host；`BingRequest.reset()` 还取消活动请求并重置当前结果。对本项目，进程内缓存足以避免每次翻译都取配置，不必迁移整个 `UserDefaults` 持久化方案。缓存复用前仍应检查字段完整性、有效数值和有效期，并避免并发请求争相刷新。[清空缓存][bing-expiry]、[请求重置][bing-reset]

### 翻译请求与结果

普通文本的请求是下列表单；URL 上的 IG/IID 与 body 中的 key/token 来自同一份配置。`URLEncoding.httpBody` 用于非 GET 请求，服务器参数不是 Edge 路径的 JSON `[{"Text": ...}]`。[请求字段][bing-request]、[URL][bing-config-url-builder]、[HTTP 编码][bing-http]

```text
POST https://<host>/ttranslatev3?isVertical=1&IG=<IG>&IID=<IID>
Content-Type: application/x-www-form-urlencoded

text=<原文>
to=<目标语言>
fromLang=<来源语言>
token=<网页 token>
key=<网页 key>
tryFetchingGenderDebiasedTranslations=true
```

请求器使用 15 秒超时、校验 HTTP 2xx、附带 Android/Chrome 131 User-Agent。若用户配置了 Bing Cookie，翻译等请求才加入 Cookie；抓取 `/translator` 的 HTML 请求没有通过该函数显式附加这个自定义 Cookie。源码没有要求用户必须配置 Cookie，也不能据此保证所有网络环境都无需 Cookie。[请求头][bing-http]、[HTML 请求][bing-html-request]、[Cookie 来源][bing-config-urls]、[常量][constants]

上游还并发请求 `/tlookupv3`，共用 `text/to/token/key`，来源语言字段改为 `from`，补充词典内容。两条请求聚合后，翻译失败会导致整体失败；非取消类词典失败仅记录日志，保留已得到的译文。这条额外请求对本项目只取译文的用途可以省略。[并发请求][bing-request]、[聚合][bing-aggregation]

翻译 JSON 先解析为对象数组，再选第一个可解码的 `BingTranslateModel`。结果字段为 `translations[].text`；模型还定义了 `detectedLanguage.language/score`、`translations[].to/transliteration/sentLen`。第二个响应对象有时带 `inputTransliteration`，上游将它用作音标，不是另一段译文。[结果处理][bing-response]、[模型][bing-model]

### 哪些错误会重试

| 情况                                 | 所查上游实现                                                  |
| ------------------------------------ | ------------------------------------------------------------- |
| JSON 对象含 `statusCode: 205`        | 解释为 token 失效，清空 token，重新执行普通翻译；最多重试一次 |
| HTTP 429                             | 返回“请求过多”错误，没有这条分支内的等待重试                  |
| 翻译与 lookup 都返回非 nil 的空 Data | 清空 token 和 host，重新发现 host 后重做一次                  |
| 一般网络、非 2xx、JSON/模型解析失败  | 返回错误，没有通用无限重试                                    |
| 英文单词到简体中文的独立词典路径失败 | 若不是取消，回到普通翻译路径                                  |

以上分别来自 [205 判定与重试][bing-aggregation]、[HTTP 错误][bing-request]、[空数据主机重试][bing-empty-retry]、[词典回退][bing-dictionary-fallback]。`205` 是 JSON 业务字段，不应写成“HTTP 205 是 token 过期”。上游把 205 解释为 token 无效的依据是其源码注释中的经验，本次没有独立实测该服务行为。

## 语言代码与长度

| 语义             | Google  | Bing          |
| ---------------- | ------- | ------------- |
| 自动识别来源语言 | `auto`  | `auto-detect` |
| 简体中文         | `zh-CN` | `zh-Hans`     |
| 繁体中文         | `zh-TW` | `zh-Hant`     |
| 英文             | `en`    | `en`          |
| 菲律宾语         | `tl`    | `fil`         |
| 挪威语           | `no`    | `nb`          |
| 塞尔维亚语       | `sr`    | `sr-Cyrl`     |
| 蒙古语           | `mn`    | `mn-Mong`     |
| 希伯来语         | `iw`    | `he`          |

这是所查提交的服务语言映射，不是两家服务完整、永久有效的语言列表。[Google 语言表][google-languages]、[Bing 语言表][bing-languages] 本项目前端当前只传 `en` 或 `zh-CN`，可以在 Rust 供应商边界转换 `zh-CN → zh-Hans`，不必改动前端配置模型。[本地翻译方向](../../src/lib/translate.ts#L57)、[本地调用](../../src/lib/translate.ts#L100)

Google 对已识别为中文且长度超过 1800 的文本取前 1800 个 Swift 字符；其他输入通过 `NSString.trimmingToMaxLength(5000)` 处理。这个兼容函数内部仍转换为 Swift `String`，trim 首尾空白后按字符数量取前缀；不是 UTF-8 字节计数，也不是直接按 UTF-16 单元切片。[Google 长度][google-length]、[兼容工具实现][string-length]

Bing 普通文本一律最多取前 1000 个 Swift 字符；中文“打开网页”链接另有 450 字符限制，该限制不适用于 HTTP 翻译请求。[Bing 文本限制][bing-length]、[网页链接][bing-word-link]

这些是上游客户端的截断策略，源码本身不能证明服务端硬上限就是 1800/5000/1000。本次网络探测看到必应页面两个输入框的 `maxlength` 均为 1000，但尚未用超长请求验证后端硬上限。

本项目为保留既有长文本能力，本次实现按至多 1000 个 UTF-16 单位分段，优先在空白处分割并保留分隔符；无空白时在完整字符边界硬切，用换行连接这些硬切段的译文，任一段失败则整个请求报错。这是本项目的设计选择，不是 Easydict 的行为；回归测试覆盖中文、emoji、长词、连续空白和 1000 单位边界不遗漏原文。[本项目实施计划](../plans/2026-10-10-easydict-google-bing-refactor.md)、[分段实现](../../src-tauri/src/web_translation.rs)、[回归测试](../../src-tauri/src/web_translation/tests.rs)

## 对 fanyifanyi 的最小改动建议

比较基线中，Google 直接 GET `translate.googleapis.com/translate_a/single`，`client=gtx`，只有 HTTP 429 会按 `Retry-After` 或退避等待重试，最多额外重试 2 次；Microsoft 每次先 GET `edge.microsoft.com/translate/auth`，只检查返回 token 包含 3 段，再 bearer POST `api-edge.cognitive.microsofttranslator.com/translate`。两家解析器都 trim 各段并用空格连接。[本地基线请求](../../src-tauri/src/lib.rs)、[本地调用契约](../../src/lib/translate.ts)

这些“本地基线”描述固定于开头记录的提交；后续重构可能改变所链接文件，不能将它们读作永久现状。

1. **Google：保留 GTX。** 采用上游 `translate.google.com` 主机和明确 User-Agent，继续保留本项目已有的有界 429 重试与错误说明。将响应解析改为保留原始段落空白。不引入仅为词典/TTS 服务的 WebApp 签名或 `batchexecute`。
2. **Bing：独立实现网页协议。** 拆分配置获取、配置解析、有效期判断、表单构造和响应解析；使用现有 `reqwest/serde_json` 与标准库。只请求 `ttranslatev3`。使用内存缓存，JSON `statusCode=205` 时使缓存失效，刷新后最多重放一次。
3. **保留应用边界。** 现有前端的中英方向、截图译成中文、命令名及返回字符串契约无需改变。`microsoft` 仍可作为既有 provider 标识，网页协议差异留在 Rust 内处理。
4. **先固定回归行为。** 保留空文本短路、目标语言、30 秒客户端超时和 Google 429 次数等原有契约；为需要纠正的分段空白行为建立新断言，再验证请求路径、form 编码、语言映射、token 复用/提前失效/205 一次重试和错误终止。
5. **避免直接搬运上游全部状态机。** 不为普通译文引入词典并发、语音、跨重启 token 持久化、静默截断、HTTP 主机探测或任意主机回退。主机策略如需调整，应限制到预期的 Bing 主机并用实际网络结果验证。上游 LICENSE 为 GPLv3；本文提取协议事实，建议在现有 Rust 结构中独立实现。[上游许可证][license]

建议的最小验证用例包括：含 `&/+/%/中文/emoji` 的请求编码、Google 多句中文和 `\n\n` 原样拼接、Bing HTML 必需字段缺失/JSON 转义/无效 TTL、缓存命中不再 GET 页面、到期刷新、205 刷新一次后成功或再次失败、旧请求不能清除新 token、429 和非 JSON 错误、空译文拒绝成功。使用本地 HTTP 服务和人工构造的响应可覆盖协议行为；真实端点短文本冒烟需单独报告结果。

## 本次网络验证

最终，主代理在 2026-10-10 运行重构后真实 Rust 客户端的 `live_web_translation_smoke`，Google 和 Bing 均成功，测试结果为 `1 passed; 0 failed`，运行耗时 6.95 秒。固定输入为 `Hello world.\nGood morning.`，日志仅记录以下公开例句译文：[最终冒烟日志](/tmp/fanyifanyi-web-translation-smoke.log)、[测试实现](../../src-tauri/src/web_translation/tests.rs)

```text
Google: Ok("你好世界。\n早上好。")
Bing: Ok("你好，世界。\n早上好。")
```

### Google HTTP 版本差分

首次 Rust 冒烟的 Google 请求曾返回 HTTP 429，自动重试 2 次后仍失败。为定位差异，主代理保持端点、查询参数及 User-Agent 相同，比较了 reqwest 默认协议与 `.http1_only()`，观察如下：[差分测试摘要](/tmp/fanyifanyi-google-http-comparison.log)

| 客户端条件                                                         | 本次结果                                 |
| ------------------------------------------------------------------ | ---------------------------------------- |
| Rust reqwest 默认协商                                              | HTTP/2.0，HTTP 429                       |
| Rust reqwest `.http1_only()`                                       | HTTP/1.1，HTTP 200，得到带换行的中文译文 |
| Python urllib 分别使用当前 Rust UA、此前 Python UA、上游 Google UA | 三组均 HTTP 200                          |

因此本项目的共享客户端显式设置 `.http1_only()`，随后最终两家业务冒烟通过。[客户端配置](../../src-tauri/src/web_translation.rs) 这证明该适配在本次环境解决了所观察到的失败，不能推断所有 HTTP/2 请求都会被 Google 拒绝，也不能把 HTTP/1.1 写成 Easydict 源码明示的协议要求。差分没有揭示服务端限流或风控的内部判定规则。

### Python 探测与网页参数

此前主代理使用 Python HTTP 客户端完成以下同例句探测；它们补充说明页面参数与重定向来源，不能替代最终 Rust 业务验证。

| 请求                                                       | 实际观察                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Google `translate.google.com/translate_a/single`，GTX 参数 | HTTP 200；得到中文译文，保留两句之间的换行                                                                                |
| Bing GET `https://cn.bing.com/translator`                  | HTTP 200，最终主机为 `www.bing.com`；HTML 包含 IG、IID、key/token/TTL，TTL 为 `3600000` 毫秒；两个输入框 `maxlength=1000` |
| Bing POST `https://www.bing.com/ttranslatev3`              | 以 Python CookieJar 保持会话，携带页面 IG/IID 与表单字段；HTTP 200，得到 `你好，世界。\n早上好。`                         |

本次验证使用 CookieJar 并不证明 Cookie 必须存在；成功的一次 token 获取也不能验证半生命周期缓存或 205 重试。探测没有测量限流阈值，也没有在线验证到期 token、长文本上限或 Google WebApp 签名，不保存实际 key/token/Cookie。

### 复现最终业务验证

从仓库根目录运行以下命令，会使用 [当前实现](../../src-tauri/src/web_translation.rs) 请求真实 Google 与 Bing，输入为上述固定例句。该测试平时标为忽略，需显式开启；网络结果可能随环境或时间变化。

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib live_web_translation_smoke -- --ignored --nocapture
```

两份 `/tmp` 日志是本次会话的临时证据；本文保留了脱敏观察值和复现入口，日志被清理后仍可理解验证范围。

## 范围与验证边界

- 已验证：从 GitHub 获取了上游固定提交，逐项阅读 Google/Bing 请求器、服务分流、语言表、长度函数、签名、缓存、错误处理和模型。所有上游引用均固定到该提交。
- 已做的业务请求为上一节的 Google/Bing 短文本探测与 Rust 冒烟：先复现 Rust Google 的 HTTP/2 429，再对照 HTTP/1.1 取得成功，最终 Rust 两家译文均验证通过。未请求 Edge 作为对照，未验证 Cookie 必要性、WebApp 签名、限流阈值、token 生命周期或真实长文本上限。本文不能声称这些网页接口对所有用户稳定可用。
- 上游 Bing 单元测试用 stub 注入翻译与 lookup 结果，覆盖“词典取消导致整体取消”和“普通词典失败仍保留译文”；它们不是当前网页端点可用性的证据，本次也未执行该测试套件。[上游测试][bing-tests]
- 两个服务都返回 `apiKeyRequirement() == .none`，只说明所查实现不要求用户填写 API key，不构成官方免费额度或接口稳定性承诺。[Google 声明][google-service-config]、[Bing 声明][bing-service-config]
- 本研究只写入这一份笔记；完整测试与静态检查结论由本项目重构记录说明。

[google-entry]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService.swift#L18-L74
[google-service-config]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService.swift#L76-L88
[dictionary-condition]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Utility/Extensions/String/String%2BAnalysis.swift#L54-L75
[google-http]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L12-L56
[google-gtx-request]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L413-L474
[google-gtx-response]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L478-L546
[paragraphs]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Utility/Extensions/String/String%2BConvenience.swift#L44-L47
[google-webapp-request]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L248-L313
[google-webapp-response]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L81-L210
[google-webapp-text]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L213-L244
[google-sign]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/google-translate-sign.js#L1-L48
[google-tkk]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BTranslate.swift#L317-L409
[google-tts-entry]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService.swift#L220-L246
[google-tts-rpc]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService.swift#L309-L365
[google-languages]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BLanguage.swift#L29-L85
[google-length]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Google/GoogleService%2BLanguage.swift#L16-L25
[string-length]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Utility/Extensions/String/String%2BObjCCompat.swift#L42-L53
[constants]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/App/EZConst.h#L38-L44
[bing-init]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L26-L37
[bing-service-config]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService.swift#L19-L49
[bing-host]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L340-L375
[bing-config-urls]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingConfig.swift#L36-L68
[bing-config-url-builder]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingConfig.swift#L126-L128
[bing-fetch-config]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L377-L459
[bing-regex]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L580-L602
[bing-expiry]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingConfig.swift#L72-L99
[bing-persistence]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingConfig.swift#L101-L148
[bing-reset]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L277-L292
[bing-request]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L41-L156
[bing-html-request]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L469-L495
[bing-http]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L525-L560
[bing-aggregation]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService%2BTranslate.swift#L47-L145
[bing-empty-retry]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingRequest.swift#L315-L337
[bing-dictionary-fallback]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService%2BTranslate.swift#L26-L45
[bing-response]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService%2BTranslate.swift#L108-L175
[bing-model]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingTranslateResponse.swift#L13-L53
[bing-languages]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService.swift#L83-L149
[bing-length]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService.swift#L229-L234
[bing-word-link]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Bing/BingService.swift#L59-L78
[bing-tests]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/EasydictTests/Service/BingServiceTests.swift#L15-L114
[license]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/LICENSE#L1-L8
