# Cleanly（简体中文汉化版）

**[简体中文](README.md)** · **[English](README.en.md)**

> 本仓库是 [0xCodez/cleanly](https://github.com/0xCodez/cleanly) 的 **Fork**，分支 `zh-cn` 提供完整的简体中文本地化，并附带一轮启动与扫描性能优化。
> 代码逻辑与上游一致，只改了文案与性能。英文原版说明见 [README.en.md](README.en.md)，上游仓库见 [0xCodez/cleanly](https://github.com/0xCodez/cleanly)。

**让你的电脑轻一点。** 一个免费、好看、不骗人的磁盘清理工具，支持 **Windows** 与 **macOS**。

Cleanly 会找出缓存、临时文件和早被遗忘的下载，把空间到底去哪了摊开给你看，然后安全地清掉——没有订阅、没有广告、不靠吓唬人。

---

## 这个分支改了什么

### 一、完整简体中文化

界面与提示全部中文化。与上游 `main` 相比共 **36 个文件**变动，其中 5 个（`electron/boot.ts`、`electron/main.ts`、`electron/services/junk.ts`、`electron/services/disk.ts`、`src/screens/SmartScan.tsx`）是性能优化，见下一节。

| 范围 | 内容 |
|---|---|
| 界面文案 | 12 个页面的标题、按钮、说明、空状态、提示语（`src/screens/`） |
| 主进程提示 | 设置校验错误、清理失败原因、进度阶段名（`electron/services/`） |
| 细节文案 | 相对时间（「3 天前」）、单位、Toast 提示、演示数据 |

**刻意保留英文的部分**（翻了反而找不到东西）：

- 产品名与品牌：`Cleanly`、`Claude`、`ChatGPT`、`Anthropic`、`OpenAI`、`Microsoft Defender`、`Google Chrome`
- 真实文件路径与目录名：`User Data`、`Service Worker`、`AppData`、`node_modules`、`.gradle`
- 磁盘卷名：`Macintosh HD`
- 分类内部 `id` 字段：改了会导致清理逻辑找不到目录

### 二、启动与扫描性能优化

上游版本首次垃圾扫描要 **36 秒**左右（首页那三张卡片全程排队等它）。本分支压到 **10 秒**内。

| 指标 | 上游 `main` | 本分支 |
|---|---|---|
| 首次垃圾扫描 | 36,838 ms（3 次中位数） | **9,641 ms**（-74%） |
| 回收站测量 | 11.7 s | **0.43 s** |
| 旧下载扫描 | 11.7 s | **0.03 s** |
| 开发者缓存 | 9.5 s | **4.7 s** |
| 磁盘信息 | 1,100 ms | **22 ms** |
| 窗口可显示 | ~0.6 s | ~0.6 s（未变） |

四处根因：

1. **回收站**原来起 PowerShell 进程、创建 `Shell.Application` COM 对象、逐项问 `System.Size`。磁盘上回收站条目就是 `$R…`（内容）/ `$I…`（元数据）成对文件，直接遍历即可，且现在覆盖**所有固定卷**而非只管 C:。
2. **旧下载**原来把每个顶层目录递归到底判断有没有新文件。目录自身 mtime 近期就已证明在被使用，直接跳过。
3. **开发者缓存**（`.gradle/caches` 10.9 万文件、`npm-cache` 4.7 万）原来逐个计数。现在限量估算并在文案里标注「显示大小为估算值」。
4. **首页三卡片**与扫描同时发起 5～6 个系统查询，抢同一块磁盘。现在延后 900 ms、结果走 30 秒 TTL 缓存、进度 IPC 限流 15 Hz。

性能部分的独立 PR 已提交上游：[#25](https://github.com/0xCodez/cleanly/pull/25)。

### 三、便携化

程序旁放一个空文件 `portable.flag`，配置与密钥就会写进同目录的 `CleanlyData/`，而不是 `%APPDATA%`。整个文件夹拷走即可随身携带，换机器不用重新配置。

---

## 功能

- **智能扫描** —— 一键告诉你还能腾出多少空间，并清掉其中安全的那部分。
- **清理** —— 临时文件、浏览器缓存（Chrome / Edge / Brave / Firefox / Safari 的每一个配置文件）、应用缓存、崩溃转储、更新残留、开发者缓存、回收站与旧下载。每一组都标了「安全」「待确认」或「永久删除」。
- **空间地图** —— 你的文件夹变成按体积大小的玻璃气泡。可以钻取任意目录，在主目录与每个磁盘（C:、D:、外接盘）之间切换。气泡还能拖起来扔，它们会相互碰撞。
- **大文件与重复文件** —— 找出所有磁盘上最大的文件和完全相同的重复副本，显示真实文件图标。
- **加速** —— 看清哪些应用随电脑启动，并关掉它们。系统级项目需要授权，和任务管理器一致。
- **应用程序** —— 每个已安装应用的真实图标、体积和最近使用时间；卸载时调用应用自带的卸载程序（Windows）或移到废纸篓（macOS）。
- **防护** —— 快速检查系统自带的安全能力（Microsoft Defender 与防火墙，或 Gatekeeper、XProtect、SIP）是否开启且为最新。Cleanly 不替代你的杀毒软件。
- **AI 助手** —— 用你自己的 API 密钥问 Claude 或 ChatGPT「哪些可以安全删掉？」。

## 安全模型

清理工具不该让你丢文件。Cleanly 建立在几条硬规则上：

- **缓存删掉，你的文件进回收站。** 缓存、临时文件和日志会自己重建，所以直接删除（移进回收站反而一点空间都不释放）。而你自己产生的东西——大文件、重复文件、旧下载、应用——一律进系统回收站，随时能还原。
- **只碰已知位置。** 清什么由类目决定，绝不由界面传来的路径决定。每个路径都会解析成真实完整形式，并在动手前再校验一次。
- **系统目录禁止触碰。** 磁盘根目录、用户主目录本身、Windows、Program Files、`$RECYCLE.BIN`、System Volume Information、网络路径、符号链接与目录联接一律拒绝——包括 Windows 短名（`DOCUME~1`）和尾部点号这类花招。
- **正在使用的文件跳过。** 24 小时内改动过的临时文件和被占用的文件会跳过并报告。
- **加速改动可回退。** 启动项用的是任务管理器同一套设置，不删任何东西，随时可以再打开。

## 隐私

- 扫描完全在你的电脑上进行。
- AI 助手是可选的。使用时只把文件的**名称、路径和体积**发给你选择的服务商，绝不发送文件内容。API 密钥用系统钥匙串加密（Electron `safeStorage`）。
- 应用内没有任何统计或追踪。

## 获取方式

**本 fork 没有提供预编译的 exe。** 上游那个单文件便携版每次启动都要先把约 360 MB 运行时自解压到临时目录，仅这一项就要 8～9 秒——这也是原版「启动很慢」的真正原因。想要快，请用目录版。

自己构建（见下节），或使用 Windows x64 的目录版产物：

```bash
npm install
npm run build
npx electron-builder --win portable --x64
```

产物在 `release/` 下。把 `release/win-unpacked/` 整个目录拷走，在 `Cleanly.exe` 旁放一个空文件 `portable.flag`，就是绿色便携版。

上游原版的官方下载（英文界面）仍可用：

| 平台 | 下载 |
|---|---|
| Windows 10/11 (x64) | [安装版](https://github.com/0xCodez/cleanly/releases/latest/download/Cleanly-setup.exe) · [便携版](https://github.com/0xCodez/cleanly/releases/latest/download/Cleanly-portable.exe) |
| macOS — Apple Silicon | [Cleanly-mac-arm64.dmg](https://github.com/0xCodez/cleanly/releases/latest/download/Cleanly-mac-arm64.dmg) |
| macOS — Intel | [Cleanly-mac-x64.dmg](https://github.com/0xCodez/cleanly/releases/latest/download/Cleanly-mac-x64.dmg) |

## 首次启动

构建产物没有购买微软 / 苹果的签名证书，所以系统会警告一次：

- **Windows：** 若出现 SmartScreen，点**更多信息 → 仍要运行**。
- **macOS：** 打开 `.dmg`，把 Cleanly 拖进**应用程序**，然后在终端执行一次：

  ```bash
  xattr -cr /Applications/Cleanly.app
  ```

## 从源码构建

需要 Node.js 22 或更高版本。

```bash
npm install        # 依赖与 Electron 二进制
npm run dev        # 带热重载启动
npm run demo       # 只在浏览器里跑界面（http://localhost:5174），带演示数据，不碰你的磁盘
npm run dist:win   # Windows 安装版 + 单文件便携版（x64）
npm run dist:mac   # macOS .dmg + .zip，arm64 与 x64（只能在 Mac 上跑）
```

产物在 `release/`。应用图标在 `build/icon.svg`，改完执行 `npm run icons`。

Windows 上如果打包报 *「could not open file」*，是项目路径超过了 260 字符限制——换一个更短的目录构建。

### 项目结构

```
electron/        主进程：扫描器、清理、回收站、启动项、应用、AI、设置
  services/      一个功能一个模块
src/             React + TypeScript 界面
  screens/       一个页面一个文件
  components/    共用 UI（气泡、WebGL 着色器、图标、按钮）
shared/types.ts  主进程与界面之间的类型契约
web/             最初的设计稿（可直接用浏览器打开）
design/          早期 UI 探索
```

### 发布

推送 `v0.2.0` 这样的标签会触发 **Build Cleanly** 工作流：Windows 在 `windows-latest` 上构建，macOS 在 `macos-latest` 上构建，两者都会附加到新的 GitHub Release。安装包文件名不含版本号，所以上面那些 `releases/latest/download/...` 链接永远指向最新构建。

## 已知问题

- **「应用程序」和「加速」页可能显示为空。** 这两个页面靠 `reg.exe` 读注册表。如果你的安全软件（例如企业安全管控平台、部分国产安全卫士）把 `reg.exe` 列入程序黑名单，列表就会是空的。放行 `reg.exe` 后点刷新即可。这不是软件缺陷。
- **开发者缓存体积是估算值。** 目录超过 6 万个文件时按上限估算，文案会标注。回报的体积最多等于实际能释放的量，不会虚高。
- **macOS 路径未实测。** 性能优化主要针对 Windows，回收站改动是 Windows 专属；macOS 走的是原本未改动的缓存路径，但我手上没有 Mac 可验证。

## 支持

Cleanly 是免费的。如果它帮到了你，可以在应用里的**打赏**页留个小费，由上游作者接收。支付由 Stripe 处理。

想法、Bug 或一句好话：**contact@beyond-media.ai**，或应用里的**反馈**页。

汉化相关的问题请提到本 fork 的 [Issues](https://github.com/2144291529/cleanly/issues)，不要提到上游。

---

原项目作者：[0xCodez](https://github.com/0xCodez) · [官网](https://getcleanly.vercel.app) · 本仓库未修改原作者的版权与署名。
