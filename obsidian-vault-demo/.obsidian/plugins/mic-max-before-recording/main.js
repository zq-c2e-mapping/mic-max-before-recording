const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const { execFile } = require("child_process");
const path = require("path");

const RECORDER_START_COMMAND_ID = "audio-recorder:start";
const RECORDER_STOP_COMMAND_ID = "audio-recorder:stop";
const DEFAULT_SETTINGS = { recordingColor: "red", autoGainControl: false, showCoreRecorderIcon: false };
const RECORDING_COLORS = { red: "#e5484d", green: "#2da44e", blue: "#3478f6" };
const CORE_RECORDER_LABELS = new Set([
  "开始/结束录音",
  "开始/停止录音",
  "start/stop recording",
  "start/stop audio recording",
  "record audio",
  "audio recorder"
]);

class MicMaxBeforeRecordingPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.running = false;
    this.coreRecorderRibbonObserver = null;
    this.addSettingTab(new MicMaxSettingsTab(this.app, this));

    this.addCommand({
      id: "toggle-recording-after-mic-max",
      name: "Set microphone to maximum and start/stop recording",
      callback: () => this.runBeforeToggle()
    });
    this.recordingRibbonButton = this.addRibbonIcon("mic", "Mic max then start/stop recording", () => {
      void this.runBeforeToggle();
    });
    try {
      this.setRecordingIndicator(Boolean(this.getRecorderInstance().recording));
    } catch (_) {
      this.setRecordingIndicator(false);
    }
    this.startCoreRecorderRibbonVisibilityTracking();
  }

  onunload() {
    if (this.coreRecorderRibbonObserver) {
      this.coreRecorderRibbonObserver.disconnect();
      this.coreRecorderRibbonObserver = null;
    }
    this.setCoreRecorderRibbonVisibility(false);
  }

  isCoreRecorderRibbonAction(element) {
    if (!element || element === this.recordingRibbonButton) return false;
    const values = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-tooltip"),
      element.getAttribute("title"),
      element.getAttribute("data-command-id")
    ].filter(Boolean).map((value) => value.trim().toLowerCase());
    return values.some((value) => value.includes("audio-recorder") || CORE_RECORDER_LABELS.has(value));
  }

  getCoreRecorderRibbonActions() {
    return Array.from(document.querySelectorAll(".side-dock-ribbon-action, .workspace-ribbon .ribbon-action"))
      .filter((element) => this.isCoreRecorderRibbonAction(element));
  }

  setCoreRecorderRibbonVisibility(shouldHide) {
    for (const element of this.getCoreRecorderRibbonActions()) {
      element.classList.toggle("mic-max-core-recorder-hidden", shouldHide);
    }
  }

  startCoreRecorderRibbonVisibilityTracking() {
    this.setCoreRecorderRibbonVisibility(!this.settings.showCoreRecorderIcon);
    if (typeof MutationObserver !== "function") return;
    this.coreRecorderRibbonObserver = new MutationObserver(() => {
      this.setCoreRecorderRibbonVisibility(!this.settings.showCoreRecorderIcon);
    });
    this.coreRecorderRibbonObserver.observe(document.body, { childList: true, subtree: true });
  }

  getVolumeHelperPath() {
    const vaultPath = this.app.vault.adapter.getBasePath();
    return path.join(vaultPath, ".obsidian", "plugins", this.manifest.id, "set-mic-volume.ps1");
  }

  getRecorderInstance() {
    const recorder = this.app.internalPlugins?.plugins?.["audio-recorder"];
    if (!recorder?.enabled || !recorder.instance) {
      throw new Error("Obsidian's Audio recorder core plugin is not enabled.");
    }
    return recorder.instance;
  }

  executeRecorderCommand(commandId) {
    const commands = this.app.commands;
    if (!commands || typeof commands.executeCommandById !== "function") {
      throw new Error("Obsidian command API is unavailable.");
    }
    if (commands.executeCommandById(commandId) === false) {
      throw new Error(`Obsidian command was not found: ${commandId}`);
    }
  }

  setRecordingIndicator(isRecording) {
    if (!this.recordingRibbonButton) return;
    this.isRecording = isRecording;
    const color = RECORDING_COLORS[this.settings.recordingColor] || RECORDING_COLORS.red;
    this.recordingRibbonButton.style.setProperty("--mic-max-recording-color", color);
    this.recordingRibbonButton.classList.toggle("mic-max-recording-active", isRecording);
    const label = isRecording ? "Recording — click to stop" : "Mic max then start/stop recording";
    this.recordingRibbonButton.setAttribute("aria-label", label);
    this.recordingRibbonButton.setAttribute("title", label);
  }

  async waitForRecordingState(expected, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Boolean(this.getRecorderInstance().recording) !== expected) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(expected ? "The audio recorder did not start in time." : "The audio recorder did not stop in time.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  executeRecorderStartWithoutAutoGainControl() {
    const mediaDevices = window.navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      throw new Error("Browser microphone capture API is unavailable.");
    }
    if (typeof mediaDevices.getSupportedConstraints === "function" &&
        !mediaDevices.getSupportedConstraints().autoGainControl) {
      throw new Error("This Obsidian runtime does not support disabling microphone auto gain control.");
    }

    return new Promise((resolve, reject) => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(mediaDevices, "getUserMedia");
      const originalGetUserMedia = mediaDevices.getUserMedia;
      let restored = false;
      let timeoutId;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        if (originalDescriptor) {
          Object.defineProperty(mediaDevices, "getUserMedia", originalDescriptor);
        } else {
          delete mediaDevices.getUserMedia;
        }
      };

      const wrappedGetUserMedia = function (constraints) {
        const updated = Object.assign({}, constraints || {});
        if (updated.audio === true || updated.audio == null) {
          updated.audio = { autoGainControl: false };
        } else if (typeof updated.audio === "object") {
          updated.audio = Object.assign({}, updated.audio, { autoGainControl: false });
        }

        try {
          const request = originalGetUserMedia.call(this, updated);
          restore();
          resolve();
          return request;
        } catch (error) {
          restore();
          reject(error);
          throw error;
        }
      };

      try {
        Object.defineProperty(mediaDevices, "getUserMedia", {
          configurable: true,
          writable: true,
          value: wrappedGetUserMedia
        });
        timeoutId = window.setTimeout(() => {
          restore();
          reject(new Error("Could not disable microphone auto gain control for the core recorder."));
        }, 5000);
        this.executeRecorderCommand(RECORDER_START_COMMAND_ID);
      } catch (error) {
        restore();
        reject(error);
      }
    });
  }

  async runBeforeToggle() {
    if (this.running) return;
    this.running = true;

    try {
      if (process.platform !== "win32") {
        throw new Error("This integration requires Windows.");
      }

      const recorder = this.getRecorderInstance();
      if (recorder.recording) {
        this.executeRecorderCommand(RECORDER_STOP_COMMAND_ID);
        await this.waitForRecordingState(false);
        this.setRecordingIndicator(false);
        return;
      }

      const helperPath = this.getVolumeHelperPath();
      await new Promise((resolve, reject) => {
        execFile(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath],
          { windowsHide: true, timeout: 30000 },
          (error, stdout, stderr) => {
            if (error) {
              const detail = (stderr || stdout || error.message).trim();
              reject(new Error(`Microphone volume setup failed: ${detail}`));
              return;
            }
            resolve();
          }
        );
      });

      if (this.settings.autoGainControl) {
        this.executeRecorderCommand(RECORDER_START_COMMAND_ID);
      } else {
        await this.executeRecorderStartWithoutAutoGainControl();
      }
      await this.waitForRecordingState(true);
      this.setRecordingIndicator(true);
    } catch (error) {
      console.error("Mic Max Before Recording:", error);
      new Notice(error.message, 8000);
      try {
        this.setRecordingIndicator(Boolean(this.getRecorderInstance().recording));
      } catch (_) {
        this.setRecordingIndicator(false);
      }
    } finally {
      this.running = false;
    }
  }
}

class MicMaxSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "麦克风录音" });

    new Setting(containerEl)
      .setName("录音中图标颜色")
      .setDesc("仅影响插件在录音期间显示的图标颜色。")
      .addDropdown((dropdown) => dropdown
        .addOption("red", "红色")
        .addOption("green", "绿色")
        .addOption("blue", "蓝色")
        .setValue(RECORDING_COLORS[this.plugin.settings.recordingColor] ? this.plugin.settings.recordingColor : "red")
        .onChange(async (value) => {
          this.plugin.settings.recordingColor = value;
          this.plugin.setRecordingIndicator(Boolean(this.plugin.isRecording));
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("启用自动增益控制")
      .setDesc("自动增益可能自动调节或降低麦克风输入音量。默认关闭。")
      .addToggle((toggle) => toggle
        .setValue(Boolean(this.plugin.settings.autoGainControl))
        .onChange(async (value) => {
          this.plugin.settings.autoGainControl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("显示 Obsidian 核心录音机图标")
      .setDesc("仅控制核心录音机在左侧功能区的图标，不会关闭核心录音机功能。默认隐藏，建议使用本插件的图标录音。")
      .addToggle((toggle) => toggle
        .setValue(Boolean(this.plugin.settings.showCoreRecorderIcon))
        .onChange(async (value) => {
          this.plugin.settings.showCoreRecorderIcon = value;
          this.plugin.setCoreRecorderRibbonVisibility(!value);
          await this.plugin.saveSettings();
        }));
  }
}

module.exports = MicMaxBeforeRecordingPlugin;
