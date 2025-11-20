# Kmoe Sync

[English Guide](docs/README-en.md)

## 简介
Kmoe Sync 是一个 Chrome 扩展，能在 kxx.moe 及其镜像站注入浮窗下载器，将选定的漫画章节打包上传到自建的 WebDAV 服务器。界面使用 Tailwind 设计语言，全程离线处理，不依赖第三方服务。

![设置页](docs/setting.png)

## 功能亮点
- **下载历史**：在设置页查看所有任务的状态、完成时间、保存路径与错误信息，并支持关键词搜索与展开详情。
- **WebDAV 管理**：添加多个服务器、路径预设及远程目录浏览，快速写入目标目录。
- **下载规则**：使用 `{title}`、`{filename}` 等变量生成自定义的文件夹/文件结构。
- **浮窗下载器**：在漫画详情页右下角唤出控制面板，选择线路、文件格式与章节组别，实时查看额度和日志。

## 安装步骤

### 从商店安装（推荐）
- **Microsoft Edge**: [从 Edge 外接程序商店安装](https://microsoftedge.microsoft.com/addons/detail/jalicelpgjimijnmpmejjhmjpnoilkel)

### 手动安装
1. 前往 [GitHub Releases](https://github.com/solywsh/kmoe-sync/releases) 下载最新版本的 zip 压缩包。
2. 解压下载的文件到本地目录。
3. 打开 `chrome://extensions/` 或 `edge://extensions/`，启用开发者模式，点击"加载已解压的扩展程序"，选择解压后的目录。
4. 在扩展详情页确认图标、权限和版本后即可使用。

### 从源码安装（开发者）
1. 克隆仓库并安装依赖：`npm install && npm run build:css`。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，启用开发者模式，点击"加载已解压的扩展程序"，选择本项目目录。
3. 在扩展详情页确认图标、权限和版本后即可使用。

## 使用指南
1. 打开扩展设置页，添加 WebDAV 服务器并填写地址、凭证与默认目录，可使用浏览按钮直接选择远程路径。
2. 进入漫画详情页，点击右下角浮窗按钮，打开下载面板。
3. 勾选需要的章节，选择线路、文件格式和保存规则，点击“开始下载”；后台 Service Worker 会依序下载并上传，进度会写入历史。

![下载面板](docs/download.png)

## 开发提示
- 修改 UI 或样式后需重新运行 `npm run build:css`，确保注入页面获得最新样式。
- Service Worker 采用 Manifest V3 ES Module，若要移植到其他浏览器，请确认其对 MV3 的支持情况。

## 隐私与安全
- 内容脚本仅在允许的域名运行，WebDAV 凭证只保存在浏览器 `chrome.storage` 中，不会上传至任何远端服务。
- 请使用自己的可信 WebDAV 服务器，并在分享或发布打包版本前移除示例配置。

## 支持
如果遇到问题，可在 Issue 中附上复现步骤、浏览器版本、控制台或历史日志信息，我们会尽快协助定位。
