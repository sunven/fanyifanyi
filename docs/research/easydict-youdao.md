# Easydict 有道词典接入调研

调研日期：2026-10-09。上游源码固定到提交 `cfda6e2f43741a3210a290e422846f1d83742d38`（2026-09-30）。
以下是该提交的实现事实；未运行 Easydict，未请求真实查词、翻译、语音或 OCR 服务。

## 结论

Easydict 的有道服务直接请求有道网页使用的 HTTP 接口，在本地解码结果，再交给原生界面显示。
服务注册为 `YoudaoService`，`apiKeyRequirement()` 返回 `.none`；当前文本路径没有用户 AppID/AppSecret 配置或网页/有道智云切换分支。[服务注册][factory]、[服务声明][service]

一次文本查询并发启动“结构化查词”和“网页翻译”，两条路径更新同一个 `result`。
捕获错误时，若 `result.hasTranslatedResult` 已为真，则记录部分失败并返回现有结果；否则抛错。这个条件接受词典结果、翻译文本或非空 HTML。[结果判定][result-check]
这是源码里的部分成功处理，不能据此保证每种网络失败时序都有完整回退。[并发入口][parallel]

```text
查询文本 → YoudaoService.translate
              ├─ POST jsonapi_s（V4）→ JSON 词典模型 → wordResult
              └─ GET webtranslate/key → POST webtranslate → AES 解密 → translatedResults
                                                        ↓
                                                原生结果界面与发音按钮
```

## 查词：V4 JSON 接口

请求地址与参数来自 [YoudaoService+Dict.swift:32–61][dict-request]。

```text
POST https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4

q       = 查询文字
le      = 外语代码（en / ja / fr / ko）
client  = web
t       = (查询文字 + "webdict").count % 10
sign    = 下述 MD5 签名
keyfrom = webdict
```

签名算法如下；`fixedKey` 是源码第 35 行的固定网页协议常量，不是用户申请的 API 密钥。
`count` 对应源码的 Swift `String.count`，移植其他语言时应核对 Unicode 长度语义。[签名实现][dict-request]

```text
ww   = text + "webdict"
t    = ww.count % 10
salt = MD5(ww)
sign = MD5("web" + text + String(t) + fixedKey + salt)
```

接口通过 Alamofire 的 `AF.request(..., method: .post, parameters: ...)` 调用，响应由 `JSONDecoder` 解为 `YoudaoDictResponseV4`，再执行 `result.update(dictV4:)`。
这个查词请求没有显式传入服务的 `headers`；不能把网页翻译的 Cookie/Referer 直接说成查词请求的必需条件。[请求与解码][dict-request]

字典分支要求启用 `.dictionary`，并且语言方向是中文与英文、日文、法文、韩文之间；其他方向抛出不支持语言。
这是查词分支的范围，网页翻译另有更广的语言表。[字典条件][dict-gates]、[翻译语言表][languages]

## 普通句子翻译：取网页参数，再签名与解密

当前 `webTranslate` 每次先调用 `getYoudaoKey()`；所查函数中没有密钥缓存分支。[翻译流程][translation]

1. `GET https://dict.youdao.com/webtranslate/key`，使用 `keyid=webfanyi-key-getter`，以及固定 `defaultKey` 生成签名。[取参数实现][key-getter]
2. 返回 JSON 的 `data.secretKey`、`data.aesKey`、`data.aesIv`，分别用于翻译请求签名和响应解密。[响应模型][key-model]
3. `POST https://dict.youdao.com/webtranslate`，传入 `i`、`from`、`to`、`dictResult=false`、`keyid=webfanyi`、`sign`、`mysticTime`。[翻译请求][translation]

两步共用 `client=fanyideskweb`、`product=webfanyi`、`appVersion=1.0.0`、`vendor=web`、`pointParam=client,mysticTime,product`、`keyfrom=fanyi.web`。
`mysticTime` 是当前毫秒时间戳。两步使用相同 MD5 拼接格式，但取参数请求用固定 `defaultKey`，翻译请求用返回的 `secretKey`。[公共参数][web-parameters]、[签名][web-sign]、[时间戳][timestamp]

```text
sign = MD5("client=" + client
         + "&mysticTime=" + timestamp
         + "&product=" + product
         + "&key=" + key)
```

这两步都显式传 `User-Agent`、`Referer=https://fanyi.youdao.com` 和源码中固定的 `OUTFOX_SEARCH_USER_ID` Cookie。
它们属于重现网页请求的协议参数；本次没有验证服务器是否仍要求每一项。[请求头][headers]、[取参数][key-getter]、[翻译请求][translation]

翻译响应处理：将 URL-safe Base64 的 `-`/`_` 转为 `+`/`/` 后解码；分别对 `aesKey`、`aesIv` 的 UTF-8 字节取 MD5，得到 16 字节 key 和 IV；使用 AES-128-CBC、PKCS7 解密。
解密后的 JSON 转为 `YoudaoTranslateResponse`；`code == 0` 时拼接嵌套数组里的 `tgt`，按换行拆成 `translatedResults`。[解密][decrypt]、[结果更新][translation-result]

## 结构化结果与发音如何显示

V4 转换器把响应放入 `result.raw`，构造 `EZTranslateWordResult`，并选取以下内容映射到应用自己的显示模型。[V4 转换器][converter]

| 有道响应                           | Easydict 处理                                 |
| ---------------------------------- | --------------------------------------------- |
| `ec.word`                          | 英文词条对象；提取英美音标、发音、词性和释义  |
| `ec.word.trs[].pos/tran`           | 词性与释义；不是旧结构的 `trs[].tr[0].l.i[0]` |
| `ec.word.wfs[].wf`、`ec.exam_type` | 词形变化、考试标签                            |
| `ce.word`                          | 中英词典条目                                  |
| `web_trans`                        | 网络释义                                      |
| `fanyi.tran`                       | 词典接口附带的翻译文本                        |

只有生成了词性释义或简明条目，转换器才挂载 `wordResult`。
模型能够解码某字段不代表 UI 会展示该字段；`good_v4.json` 含有更多数据，实际展示应看转换器选取的子集。[转换器][converter]、[模型][v4-model]、[仓库样例][fixture]

界面通过 `EZWordResultView` 的原生视图展示音标/发音按钮、释义、词形和简明条目，并非把有道结果网页直接嵌进窗口。[音标视图][view-phonetics]、[释义等视图][view-details]

有道词条的 `usspeech`/`ukspeech` 接到 `https://dict.youdao.com/dictvoice?audio=` 后成为发音地址；例如样例的 `usspeech` 是 `good&type=2`。
缺少音标时，转换器还会为英文词条构造转义后的查询文字发音地址。音频按钮把 `speakURL` 交给播放器，有 URL 时直接播放。[词条发音][pronunciation]、[样例][fixture]、[播放器][player-input]、[播放分支][player-play]

通用 TTS 也只是生成 `dictvoice?audio=<text>&le=<language>&type=<accent>` URL；`type=1` 为英音、`type=2` 为美音。[TTS 实现][tts]

## 当前 V4 与旧 V2 的区别

上游 2026-09-22 开发记录说明：旧 `/jsonapi` 路径被称为 V2；V4 使用 `/jsonapi_s?doctype=json&jsonversion=4`。
两套响应的关键差异是 `ec.word` 在 V2 中为数组、在 V4 中为对象。[移除计划][v2-plan]

V2 自接入 V4 时就已废弃，删除前 `queryYoudaoDict` 已经只调用 V4。
2026-09-22 清理删除的是无调用的 V2 请求函数、转换器、模型和样例，不是当天才把线上运行切换到 V4；这也不能证明有道服务端停用了 V2。[移除记录][v2-history]、[当前入口][dict-entry]

## 对 fanyifanyi 的直接参考

本项目已经在 Rust 后端直接 GET `https://dict.youdao.com/jsonapi`，指定 `jsonversion=2`、`client=mobile`、`q` 和 `dicts`。
`dicts` 请求 `simple/phrs/syno/ec/rel_word`，当前前端从 `ec.word[0]`、`trs[].tr[0].l.i[0]` 提取数据。[本地请求](../../src-tauri/src/lib.rs#L75)、[词条适配](../../src/lib/dictionary.ts#L150)、[释义适配](../../src/lib/dictionary.ts#L83)

推论：两者都是直接请求有道结构化接口；本项目若参考 Easydict 升到 V4，需要一起调整请求方法/签名和响应适配，不能仅替换 URL。
音标、词形、考试标签、网络释义等可参考其模型映射；本次只调研，没有修改产品代码。

## 范围与验证边界

- 本次读取了固定提交的请求层、结果模型/转换器、视图、播放器和上游迁移记录；核对了 `good_v4.json` 的对象结构、`pos/tran` 释义、发音字段与考试标签。
- 没有对有道真实服务发起业务请求，因此不能保证这些网页端点、固定签名常量或 Cookie 在调研日仍可用，也未测量延迟/限流。
- `.none` 表示 Easydict 当前实现不要求用户填写 API key，不等于有道官方向第三方承诺免费额度或稳定接口。
- OCR 是独立分支：源码 POST `https://aidemo.youdao.com/ocrtransapi1`，参数 `imgBase=data:image/png;base64,...`；不是本文查词/文本翻译所用接口，也没有所查代码中的智云文本 API 配置切换。[OCR 实现][ocr]

[factory]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Model/QueryServiceFactory.swift#L117
[result-check]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Model/QueryResult.swift#L252-L254
[service]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService.swift#L22-L53
[parallel]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService.swift#L207-L231
[dict-entry]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BDict.swift#L13-L15
[dict-request]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BDict.swift#L32-L61
[dict-gates]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BDict.swift#L19-L86
[languages]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService.swift#L184-L204
[translation]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L48-L94
[key-getter]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L104-L131
[key-model]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/Model/YoudaoKey.swift#L18-L28
[web-parameters]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L20-L45
[web-sign]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L134-L143
[timestamp]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L211-L214
[headers]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService.swift#L26-L31
[decrypt]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L145-L203
[translation-result]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BTranslate.swift#L216-L254
[converter]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/EZQueryResult%2BDictV4.swift#L14-L205
[v4-model]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/Model/YoudaoDictResponseV4.swift#L479-L518
[fixture]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/Model/DictJSONExample/v4/good_v4.json
[view-phonetics]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/objc/ViewController/View/WordResultView/EZWordResultView.m#L372-L440
[view-details]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/objc/ViewController/View/WordResultView/EZWordResultView.m#L524-L724
[pronunciation]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/EZQueryResult%2BDictV4.swift#L22-L88
[player-input]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/objc/Service/AudioPlayer/EZAudioPlayer.m#L148-L154
[player-play]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/objc/Service/AudioPlayer/EZAudioPlayer.m#L203-L210
[tts]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService.swift#L120-L145
[v2-plan]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/docs/exec-plans/completed/2026-09/2026-09-22-remove-deprecated-youdao-v2.md#L16-L25
[v2-history]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/docs/histories/2026-09/2026-09-22-remove-deprecated-youdao-v2.md#L18-L35
[ocr]: https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Youdao/YoudaoService%2BOCR.swift#L27-L47
