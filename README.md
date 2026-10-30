# Mic Max Before Recording

这是一个面向 Windows 桌面版 Obsidian 的录音辅助插件。点击插件麦克风图标或运行插件命令时，插件会先把 Windows 中所有**活动的录音端点**音量设为 100%，确认成功后再启动 Obsidian 内置录音机。它不会只寻找 Obsidian 当前选中的麦克风；因此，多个活动录音设备的系统输入音量都可能被调整。已禁用的设备不会被处理，静音状态不会被更改。

录音开始后再次点击插件图标或运行同一命令即可停止录音；停止时不会调整音量。音量设置失败时，插件会显示错误并取消启动录音。

## 安装与要求

- Windows 桌面版 Obsidian；插件使用 Windows Core Audio 和 PowerShell。
- 在 Obsidian 的「设置 → 核心插件」中启用 **Audio recorder（录音机）**。
- 将 `mic-max-before-recording` 文件夹放到 vault 的 `.obsidian/plugins/` 目录，并在「设置 → 第三方插件」中启用插件。

插件包含 `set-mic-volume.ps1`，不依赖仓库旁边的 `mic-max` 文件夹或 SoundVolumeView。Obsidian 必须能够启动系统 PowerShell 来运行该脚本。

## 使用方法

点击左侧功能区的麦克风图标即可开始或停止录音。也可以在「设置 → 快捷键」中搜索 **Set microphone to maximum and start/stop recording**，为该命令绑定快捷键。录音期间插件图标会显示设置的提示色。

## 插件设置

- **录音中图标颜色**：红色（默认）、绿色或蓝色。只改变插件图标，不影响录音内容。
- **启用自动增益控制**：默认关闭。开启后使用录音机的默认采集请求；自动增益可能自动调节甚至降低麦克风输入音量。关闭时插件会请求禁用自动增益；如果当前 Obsidian 运行环境不支持该选项，则不会启动录音并会提示错误。

## 故障排查与兼容性

若录音未启动，请确认运行于 Windows、核心录音机已启用，并检查错误提示。插件通过 Obsidian 录音机的内部运行时接口读取录音状态和调用开始/停止命令；Obsidian 升级后这些接口可能变化。完成升级后请实际测试开始、停止以及音量设置行为。
