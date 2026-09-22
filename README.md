# 测试失败定位工具

加载一次**真实测试运行**的结果文件（JUnit XML），按「测试套件 → 测试文件 → 测试用例」层级展示，把失败用例的错误消息、异常类型、堆栈、耗时集中呈现，并能从堆栈中的文件/行号直接跳到对应源码位置。

本仓库初始化时只有本说明文档，没有任何既有代码或测试框架。因此这里落地的是 README 所描述的最小完整实现：React + TypeScript 页面、与框架无关的 JUnit 解析核心，以及一个零第三方 Web 框架依赖的 Node API。它不重写测试调度系统，只消费测试工具已经产出的报告。

## 功能

- 层级结构：顶层 `testsuites` / 嵌套 `testsuite` / `testcase` 原样还原，套件节点显示含子级的状态聚合。
- 四种状态：通过、失败、跳过、未执行（`notrun` 等），未知 `status` 值按“未执行”展示并在“解析提示”面板中警告。
- 失败详情：失败步骤（错误首行）、异常类型（`type` 属性或正文首行推断）、错误消息、完整堆栈、用例耗时、stdout/stderr。
- 源码定位：解析堆栈帧中的文件、行、列（V8/Node、Python、Java、Go、.NET 以及 vitest JUnit 方言的 `❯ file:line:col`），点击即在源码视图中高亮对应行；行号越界、文件缺失、路径越界都有明确提示。
- 筛选：按一个或多个状态、按测试文件、按关键字（用例名 / classname / 文件 / 异常类型 / 错误消息）组合筛选。
- 重试：支持 `flakyFailure` / `flakyError` / `rerunFailure` / `rerunError`，以及 vitest 输出的重复 `<failure>` 节点；展示最终结果、重试次数与每次失败详情。
- 健壮性：空报告、非法 XML、非 JUnit 文档、非法 `time`、缺少堆栈、空失败体、未知状态、无效源码路径都返回结构化错误或解析警告。

## 架构

```
src/shared/            与运行环境无关的核心逻辑（服务端/浏览器/测试共用）
  types.ts             领域模型（TestRun / TestCase / StackFrame ...）
  junit.ts             JUnit XML 解析器（fast-xml-parser）
  stack.ts             跨语言堆栈帧解析
  filter.ts            状态/文件/关键字筛选
  source.ts            源码路径解析与工作目录越界防护
server/
  app.ts               POST/GET /api/parse、GET /api/source、/api/health
  dev-server.ts        开发模式：API(8787) + Vite(5173，/api 代理)
  server.ts            生产模式：API + 托管 dist/
src/client/            React + TypeScript 页面（Vite 构建）
tests/                 vitest 单元/组件/HTTP 集成测试（jsdom + Testing Library）
fixtures/real-run/     真实测试项目：由 vitest 实际运行产出 junit.xml
scripts/
  verify-real-run.ts   对真实报告做 API 级全链路断言
  verify-browser.ts    Playwright Chromium 驱动真实页面验证
```

数据流只有一条：测试工具产出的 JUnit XML → `parseJunitXml` → 页面渲染；堆栈帧 → `/api/source` → 真实源码文件。没有任何内置示例报告或硬编码结果。

## 使用

```bash
npm install
npm run dev          # 开发：http://localhost:5173（API 在 8787）

npm run build        # 类型检查 + 产物到 dist/
npm run start        # 生产模式（需先 build），默认 http://localhost:8787
```

页面支持两种加载方式：

1. 输入工作目录内的报告路径（如 `fixtures/real-run/junit.xml`），由服务端读取。
2. 选择本地 XML 文件上传，浏览器把文本发给解析接口，不落盘。

源码访问被限制在服务器工作目录内（拒绝 `../` 穿越），报告机路径与当前目录不一致时用 basename 索引兜底匹配。

## 真实运行与验证

`fixtures/real-run` 是一个真实的 vitest 项目（含通过、失败、跳过用例和一个前两次失败第三次成功的 flaky 用例，`retry: 2`）。报告由测试运行器实际生成：

```bash
npm run test:real     # vitest 实际执行 → fixtures/real-run/junit.xml → API 全链路断言
npm run test:browser  # 构建产物 + 真实 Chromium 验证加载/筛选/详情/源码跳转
npm run verify        # typecheck + 全部单测 + build + test:real + 浏览器验证
```

说明：`fixtures/real-run/junit.xml` 在 `.gitignore` 中，它是运行产物而非静态示例；单测中的 XML 字符串仅用于解析器边界用例，不用于页面/端到端验证。

## 范围与限制

- 只实现 JUnit XML 一种报告格式（仓库没有既有测试框架，JUnit 是生态覆盖最广的选项）；pytest JSON 等未实现，但解析器是独立模块，后续可在同一模型上扩展。
- “失败步骤”在 JUnit 模型中没有独立字段，取错误正文首行作为步骤摘要。
- 不实现测试调度、重新执行或在线监听；重试信息只读展示。
- 源码浏览是内置的只读文件视图（行高亮），未与外部编辑器深度集成。
