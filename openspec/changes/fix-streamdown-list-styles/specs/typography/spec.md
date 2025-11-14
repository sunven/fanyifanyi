# 规格说明：Typography 样式系统

## ADDED Requirements

### Typography 插件集成

**Requirement 1**: 项目必须集成 Tailwind CSS Typography 插件

**描述**: 
- 添加 `@tailwindcss/typography` 依赖到 `package.json`
- 在 Tailwind 配置中启用 typography 插件
- 确保插件正确加载并生成样式类

**实现位置**: 
- `package.json` (dependencies)
- `src/index.css` (插件配置)

**验证**:
- 运行 `pnpm list @tailwindcss/typography` 验证安装
- 检查构建输出包含 typography 相关 CSS

---

**Requirement 2**: Streamdown 容器必须应用 Typography 样式类

**描述**:
- 在 `TranslateDisplay` 组件的 Streamdown 容器上应用 `prose` 类
- 深色模式下使用 `prose-invert` 类
- 确保样式不影响容器布局

**实现位置**: `src/components/translate-display/index.tsx`

**代码示例**:
```tsx
<div className="flex-1 overflow-y-auto break-words prose dark:prose-invert max-w-none">
  <Streamdown isAnimating={isStreaming} controls={true}>
    {translatedText}
  </Streamdown>
</div>
```

**验证**:
- TypeScript 编译无错误
- 开发模式下检查 DOM 元素包含正确的类

---

### 列表渲染规格

**Requirement 3**: 有序列表 (ol) 必须正确显示

**描述**:
- 数字编号左对齐且可见
- 每个列表项有足够的左内边距以容纳序号
- 序号与内容之间有适当间距
- 序号宽度自适应（个位数、十位数等）

**样式特征**:
```css
/* Typography 插件生成的默认样式 */
.prose ol {
  list-style: none;
  counter-reset: list-counter;
}

.prose ol > li {
  counter-increment: list-counter;
  position: relative;
  padding-left: 1.5rem;
}

.prose ol > li::before {
  content: counter(list-counter) ".";
  position: absolute;
  left: 0;
  font-weight: 400;
  text-align: right;
}
```

**场景**:

#### Scenario: 单层有序列表
**输入**:
```
1. 第一项
2. 第二项
3. 第三项
```

**期望输出**:
- ✅ 数字 1、2、3 左对齐显示
- ✅ 序号与文本之间有空格分隔
- ✅ 列表项左内边距为 1.5rem (24px)

#### Scenario: 多层嵌套有序列表
**输入**:
```
1. 外层第一项
   1. 嵌套第一项
   2. 嵌套第二项
2. 外层第二项
```

**期望输出**:
- ✅ 外层序号正常显示
- ✅ 嵌套列表序号独立计数（重新开始）
- ✅ 嵌套列表额外缩进 1.5rem
- ✅ 清晰的视觉层次

---

**Requirement 4**: 无序列表 (ul) 必须正确显示

**描述**:
- 项目符号（默认 •）左对齐且可见
- 每个列表项有足够的左内边距以容纳符号
- 项目符号与内容之间有适当间距
- 嵌套列表使用不同的视觉标记

**样式特征**:
```css
/* Typography 插件生成的默认样式 */
.prose ul {
  list-style: none;
}

.prose ul > li {
  position: relative;
  padding-left: 1.5rem;
}

.prose ul > li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: rgb(115 115 115);
}
```

**场景**:

#### Scenario: 单层无序列表
**输入**:
```
- 项目一
- 项目二
- 项目三
```

**期望输出**:
- ✅ 项目符号 (•) 左对齐显示
- ✅ 符号颜色为中性灰色
- ✅ 列表项左内边距为 1.5rem (24px)

#### Scenario: 嵌套无序列表
**输入**:
```
- 外层项目
  - 嵌套项目一
  - 嵌套项目二
- 另一个外层项目
```

**期望输出**:
- ✅ 外层项目使用实心圆点 (•)
- ✅ 嵌套列表也使用实心圆点但颜色较浅
- ✅ 嵌套列表额外缩进 1.5rem
- ✅ 视觉层次清晰

---

**Requirement 5**: 列表项内容必须完整可见

**描述**:
- 列表项的文字内容不能被遮挡
- 项目符号或序号必须在可视区域内
- 内容区域有足够的空间显示文本

**验证**:
- 检查 `li` 元素的 `padding-left` 至少为 1.5rem
- 确保父容器 `overflow-y: auto` 不裁剪内容
- 验证在小尺寸容器中列表仍然可见

**边缘情况**:

#### Scenario: 包含长文本的列表项
**输入**:
```
- 这是一个很长很长很长很长很长很长很长很长很长很长很长很长的列表项
```

**期望输出**:
- ✅ 文本正确换行显示
- ✅ 左内边距保持一致
- ✅ 没有内容被遮挡

#### Scenario: 列表项包含代码或特殊字符
**输入**:
```
- 使用 `npm install` 命令
- 特殊字符: < > & " '
```

**期望输出**:
- ✅ 内联代码正确渲染
- ✅ 特殊字符正确转义
- ✅ 列表样式保持一致

---

### 主题适配规格

**Requirement 6**: 浅色模式下列表样式必须正确

**描述**:
- 在浅色模式下，所有列表元素使用适当的颜色
- 项目符号或序号颜色为中性灰色，与文本区分
- 背景色与前景色有足够对比度

**色彩规范**:
- 文本颜色: `--foreground` (深灰色)
- 项目符号颜色: 中性灰色 (rgb(115 115 115))
- 列表项边框: 无或使用 `border-border`

**验证**:
- 检查在浅色模式下的对比度 >= 4.5:1
- 使用浏览器开发者工具切换主题验证

---

**Requirement 7**: 深色模式下列表样式必须正确

**描述**:
- 使用 `prose-invert` 类自动适配深色模式
- 项目符号或序号颜色在深色背景下清晰可见
- 整体配色符合深色主题设计

**深色模式特征**:
```css
/* Typography 插件的 dark:prose-invert 样式 */
.dark .prose-invert {
  color: rgb(229 231 235);
}

.dark .prose-invert ul > li::before {
  color: rgb(156 163 175);
}
```

**验证**:
- 在深色模式下所有元素可见
- 颜色对比度符合可访问性标准
- 列表样式与整体深色主题一致

---

### 其他 Markdown 元素规格

**Requirement 8**: 标题样式必须统一

**描述**:
- 标题 (h1-h6) 使用合适的字体大小和字重
- 标题之间有足够的间距
- 在深色/浅色模式下颜色正确

**样式参考**:
```css
.prose h1 { font-size: 2.25em; font-weight: 800; margin-top: 0; margin-bottom: 0.8888889em; }
.prose h2 { font-size: 1.5em; font-weight: 700; margin-top: 2em; margin-bottom: 1em; }
.prose h3 { font-size: 1.25em; font-weight: 600; margin-top: 1.6em; margin-bottom: 0.6em; }
```

---

**Requirement 9**: 段落和文本样式必须一致

**描述**:
- 段落间距适当（行间距、段间距）
- 文本颜色与主题一致
- 长文本正确换行

**样式参考**:
```css
.prose p {
  margin-top: 1.25em;
  margin-bottom: 1.25em;
  line-height: 1.75;
}
```

---

**Requirement 10**: 代码块和内联代码样式必须正确

**描述**:
- 代码块使用等宽字体，有背景色
- 内联代码使用 `inline-code` 样式
- 代码块在深色/浅色模式下都可见

**验证**:
- 运行翻译测试包含代码的文本
- 检查代码块样式不被列表样式影响

---

## 测试验证

### 功能测试

1. **基本渲染测试**
   - [ ] 安装 typography 插件后构建成功
   - [ ] 应用 `prose` 类无错误
   - [ ] TypeScript 编译通过

2. **列表渲染测试**
   - [ ] 有序列表正确显示序号
   - [ ] 无序列表正确显示项目符号
   - [ ] 嵌套列表正确缩进
   - [ ] 列表项内容不被遮挡

3. **主题切换测试**
   - [ ] 浅色模式下样式正确
   - [ ] 深色模式下样式正确
   - [ ] 动态切换时样式更新

4. **兼容性测试**
   - [ ] 代码块样式正常
   - [ ] 标题样式正常
   - [ ] 链接样式正常
   - [ ] 引用样式正常

### 性能验证

- [ ] CSS 文件大小增加 < 20KB
- [ ] 构建时间增加 < 3 秒
- [ ] 运行时无性能影响

### 可访问性验证

- [ ] 颜色对比度 >= 4.5:1
- [ ] 列表支持屏幕阅读器
- [ ] 键盘导航正常

## 验收标准

所有 REQUIREMENT 必须通过才能验收：

1. ✅ Typography 插件正确安装和配置
2. ✅ Streamdown 容器应用了正确的样式类
3. ✅ 有序列表正确显示且不被遮挡
4. ✅ 无序列表正确显示且不被遮挡
5. ✅ 嵌套列表正确缩进
6. ✅ 浅色模式下样式正确
7. ✅ 深色模式下样式正确
8. ✅ 标题样式统一
9. ✅ 段落和文本样式一致
10. ✅ 代码样式正确

完成所有测试后，该规格即视为验收通过。
