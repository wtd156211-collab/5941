# 测试失败定位工具

这个项目面向需要快速定位测试失败的开发者：把一次真实测试运行的结果加载进来，按测试套件、测试文件、测试用例的层级展示，并把失败用例的错误消息、异常类型、堆栈信息和耗时集中在一处，省去在 CI 日志里逐行翻找的过程。

之所以做这件事，是因为测试失败信息通常散落在控制台输出和报告文件里，堆栈里的文件与行号还要人工对照源码。项目希望把「哪条用例失败、失败在哪一步、对应哪个文件哪一行」串成一条线索：既能按失败状态、测试文件或关键字筛选，也能从堆栈直接跳到对应的源码位置。

范围上以仓库现有测试框架产出的报告格式为准（例如 JUnit XML、pytest JSON 或已有的自定义格式），展示的数据全部来自真实运行结果。项目不重写测试框架，也不实现完整的测试调度系统，只做失败信息到源码位置这一段可验证的链路。计划沿用仓库已有的前端技术栈（默认 React + TypeScript）以及已有的报告解析与源码浏览接口，避免出现第二套数据来源。

## 现状与限制

本仓库初始化时只有上述说明文档，没有任何既有代码、测试框架或前端。因此这里落地的是 README 所描述的最小完整实现：React + TypeScript 页面、与运行环境无关的 JUnit 解析核心，以及一个零第三方 Web 框架依赖的 Node API。它不重写测试调度系统，只消费测试工具已经产出的报告文件。

## 功能

- 层级结构：顶层 `testsuites` / 嵌套 `testsuite` / `testcase` 原样还原，套件节点聚合显示各状态数量。
- 四种状态：通过、失败、跳过、未执行（`notrun`）；未知 `status` 值按“未执行”展示并在“解析提示”面板中警告。
- 失败详情：错误消息、异常类型（`type` 属性或正文首行推断）、完整堆栈、用例耗时、stdout/stderr。
- 源码定位：解析堆栈帧中的文件、行、列（V8/Node、Python、Java 以及 vitest JUnit 方言的 `❯ [函数名 ]文件:行:列`），点击即在源码视图中高亮对应行；行号越界、文件缺失、路径越界都有明确提示。
- 筛选：按一个或多个状态、按测试文件、按关键字（用例名 / classname / 文件 / 异常类型 / 错误消息）组合筛选。
- 重试：支持 `flakyFailure` / `flakyError` / `rerunFailure` / `rerunError` 以及 vitest 输出的重复 `<failure>` 节点；展示最终状态、重试次数与每次失败的详情。
- 健壮性：空报告、非法 XML、非 JUnit 文档、非法 `time`、缺少堆栈、空失败体、未知状态、无效源码路径都返回结构化错误或解析警告。

## 架构

```
src/shared/            与运行环境无关的核心逻辑（服务端 / 浏览器 / 测试共用）
  types.ts             领域模型（TestRun / TestCase / StackFrame ...）
  junit.ts             JUnit XML 解析器（fast-xml-parser）
  stack.ts             跨语言堆栈帧解析
  filter.ts            状态 / 文件 / 关键字筛选
  source.ts            源码路径解析与工作目录越界防护
server/
  app.ts               POST /api/parse、GET /api/source、GET /api/health
  dev-server.ts        开发模式：API(8787) + Vite(5173，/api 代理)
  server.ts            生产模式：API + 托管 dist/
src/client/            React + TypeScript 页面（Vite 构建）
fixtures/real-run/     真实 vitest 项目，运行后产出真实 JUnit 报告
scripts/
  verify-real-run.ts   端到端：真实运行 → API 解析 → 源码定位 → 异常路径
  verify-browser.ts    Playwright 真实浏览器验证页面行为
tests/                 vitest 单元 / 组件 / API 测试
```

## 命令

```bash
npm install
npm run dev           # 开发模式（API 8787 + Vite 5173）
npm run build         # 类型检查 + 前端构建到 dist/
npm start             # 生产模式（默认 8787，托管 dist/）
npm test              # 单元 / 组件 / API 测试
npm run typecheck     # TypeScript 类型检查
npm run test:real     # 真实运行 fixture 测试并做端到端验证
npm run test:browser  # Playwright 浏览器验证（需要可用的 chromium）
npm run verify        # typecheck + test + build + test:real
```

页面默认加载 `fixtures/real-run/report.xml`（由 `npm run test:real` 中的真实 vitest 运行生成），也可以在输入框中填写仓库内任意 JUnit XML 路径。

## 环境说明

- 报告与源码文件访问都被限制在仓库目录内，越界路径返回明确错误。
- 本容器中运行 `test:browser` 需要 chromium 系统库；若主机缺少 `libnss3` 等依赖且无 sudo 权限，可本地下载 deb 解包后通过 `LD_LIBRARY_PATH` 提供。
