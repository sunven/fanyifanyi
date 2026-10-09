# 截图 OCR 软件方案调研

调研日期：2026-10-09。依据官方文档和开源仓库；代码结论固定到所列提交，不代表所有已发布版本。没有跨软件实测，不据宣传文字排列性能名次。

## 结论

macOS 截图工具使用系统 OCR 是成熟路线：Easydict 和 Pot 都使用 Apple Vision。其他可选路线包括 Windows 系统 OCR、Tesseract、本地 PaddleOCR/RapidOCR，以及云 OCR 服务。OCR 与翻译通常可独立选择，使用 AI 翻译不等于使用 AI 大模型识别截图。

与本项目最相关的发现是 **Easydict 已经实现 Vision 启动预热**，而且其开发记录报告了类似的 E5RT 冷启动长等待。但这是该项目特定系统上的诊断，不能直接代替本项目根因验证。

## 软件对照

| 软件 | 已确认的 OCR 方案 | OCR 与翻译 | 冷启动处理证据 |
| --- | --- | --- | --- |
| Easydict（macOS） | 本地 Apple Vision；代码另有百度、有道 OCR 服务 | OCR 引擎返回文字结果，另有多个翻译服务 | 明确实现启动延迟 3 秒、后台低优先级、每进程一次预热 |
| Bob（macOS） | 当前默认离线文本识别；可选腾讯、百度、有道、Google、火山等云服务 | 官方明确截图翻译先识别文字，再调用文本翻译服务 | 闭源；本次未找到底层引擎、revision、预热的公开证据 |
| Pot（跨平台） | macOS Apple Vision；Windows 系统 OCR；Linux Tesseract；另有 Tesseract.js、RapidOCR/PaddleOCR 插件及云 OCR | 独立 OCR 与截图翻译功能，识别服务和翻译服务分别配置 | macOS 系统 OCR 每次启动随包 CLI 子进程；所查调用处未见常驻进程或预热 |
| PowerToys Text Extractor（Windows） | 本地 Windows.Media.Ocr，依赖已安装语言包 | 框选文字到剪贴板，本模块并非截图翻译器 | 本次未验证预热机制 |
| Capture2Text（Windows） | 本地 Tesseract 和语言数据，提供裁边、纠偏预处理 | 翻译是另一个需要联网的功能 | 本次未验证预热机制；仅作为既有实现示例，不作维护状态结论 |

## Easydict：可直接借鉴的预热实现

代码提交：`cfda6e2f43741a3210a290e422846f1d83742d38`。

- [真实 OCR 引擎](https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Apple/AppleOCREngine/AppleOCREngine.swift)：macOS 26 及以上使用 `RecognizeTextRequest`，其他系统使用 `VNRecognizeTextRequest`；高精度识别、语言纠错。返回识别文字，再进行排序合并和语言处理；默认不启用额外的多语言二次识别。
- [预热实现](https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/Swift/Service/Apple/AppleOCREngine/AppleOCREngine%2BWarmUp.swift)：锁保证每进程最多一次，`Task.detached(priority: .utility)` 延迟 3 秒；合成 320×96 的中英文文字图，执行与真实请求匹配的 Vision 配置；失败只记录日志。
- [启动调用](https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/Easydict/App/EasydictApp.swift)：应用入口明确调用 `warmUpVisionOCRIfNeeded()`，并非只有未接入的工具函数。
- [项目开发记录](https://github.com/tisfeng/Easydict/blob/cfda6e2f43741a3210a290e422846f1d83742d38/docs/exec-plans/completed/2026-09/2026-09-26-ocr-cold-start-warmup.md)：作者报告 E5RT 找不到预编译资源而触发运行时编译，同配置冷态 68.6/113.0 秒、热态 0.231 秒；预热热态 0.203–0.499 秒。作者也明确记录 App 内首次真实 OCR 验证受权限与多实例干扰，传统 API 分支只做静态检查。

证据边界：预热行为有源码和启动接入点支持；底层编译解释和耗时来自该项目的开发记录，不是 Apple 官方确认，也不是本次重新测量。没有证据证明本项目 revision 2 的首次约 1.33 秒与其分钟级问题完全同因。

## Bob：离线优先，多服务切换

- [官方 OCR 使用文档](https://bobtranslate.com/guide/quickstart/ocr.html)：macOS 11 以上支持离线识别，在线服务可选；OCR 独立窗口支持连续识别、智能分段。
- [官方失败处理说明](https://bobtranslate.com/faq/ocr-fail.html)：明确新版本已将离线文本识别作为默认 OCR 服务。
- [官方语言说明](https://bobtranslate.com/faq/supported-languages.html)：明确截图翻译先 OCR 提取文本，再用文本翻译服务翻译。
- [官方仓库 README](https://github.com/ripperhe/Bob/blob/3e51986a299ce2845b6180c30f259bc9c0af7f46/README.md)：明确 Bob 不是开源软件，列出支持的识别与翻译服务。

不能由“离线”直接推断当前版本内部一定使用 Vision，更不能据旧开源代码推断当前版本是否预热或固定 revision。

## Pot：系统 OCR 加可选引擎

代码提交：`594d32ede96acd106b0256deaa8bb440ffcdff40`。

- [官方支持清单](https://github.com/pot-app/pot-desktop/blob/594d32ede96acd106b0256deaa8bb440ffcdff40/README.md)：列出 Apple Vision、Windows.Media.OCR、Linux Tesseract，以及 Tesseract.js、RapidOCR/PaddleOCR 离线插件、百度/腾讯/火山等在线识别。
- [系统 OCR 调用](https://github.com/pot-app/pot-desktop/blob/594d32ede96acd106b0256deaa8bb440ffcdff40/src-tauri/src/system_ocr.rs)：识别裁切后的 `pot_screenshot_cut.png`；macOS 每次启动随包的 `ocr-{arch}-apple-darwin` 可执行文件，Windows 每次按语言构建 `OcrEngine`，Linux 启动 `tesseract`。不能由此断言系统底层缓存是否复用。
- [Tesseract.js 调用](https://github.com/pot-app/pot-desktop/blob/594d32ede96acd106b0256deaa8bb440ffcdff40/src/services/recognize/tesseract/index.jsx)：在本地 WASM 识别，`langPath` 指向远端语言数据地址。因此“本地识别”不等于首次使用完全没有下载。

所查调用处没有固定 Vision revision 或启动预热的证据；macOS 辅助二进制内部实现本次未逐行审查。

## Windows 参照

- [PowerToys 官方文档](https://learn.microsoft.com/en-us/windows/powertoys/text-extractor)：依赖 Windows OCR 语言包，截取屏幕区域并复制识别文字；[当前识别器源码](https://github.com/microsoft/PowerToys/blob/27ae0c624d0b81977fb275020a3adc9637ef5517/src/modules/PowerOCR/PowerOCR.Core/Ocr/WindowsOcrRecognizer.cs)使用系统 OCR。没有必要把 OCR 做成大型通用生成模型调用。
- [Capture2Text 官方文档](https://capture2text.sourceforge.net/)：说明 OCR 语言数据、Tesseract 配置、Trim Capture 和 Deskew Capture，并明确翻译功能需要联网。展示了“局部截图预处理 → 本地 OCR → 可选在线翻译”的另一条路线。

## 对本项目的建议

1. 继续保留当前 Apple Vision 本地方案；本次资料没有证明替换为云 OCR、Tesseract 或 PaddleOCR 能改善当前已修复后的首次延迟。
2. 若要进一步改善第一次体验，Easydict 的“延迟、低优先级、每进程一次、真实配置匹配”预热有直接源码先例。但初始化成本被提前承担，并未消失；本项目当前约 1.33 秒的首次成本与对方分钟级问题应分别权衡。
3. 可实验在进入截图模式时预热，让用户框选期间与初始化重叠。这是针对本项目的建议，不是本次已证实的其他软件做法；需防止预热和真实请求重复争抢资源。
4. 先量化本项目冷态/热态耗时、峰值内存和启动 CPU，再决定是否默认预热。没有跨软件同图同机基准，就不以“某软件看起来快”作为换引擎依据。

本次仅调研，未修改 OCR 业务代码。
