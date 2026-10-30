# Repository Guidelines

## Project Structure & Module Organization

This workspace contains two folders. `mic-max/` is the Windows microphone/audio-volume utility: `SetAllRenderVolume.ps1` holds the logic, `SetAllRenderVolume.bat` is the interactive launcher, and `RunBackground.vbs` starts it without a visible window. `settings.example.ini` documents the configuration shape; `settings.ini` is the local active configuration. `SoundVolumeView/` contains the bundled executable and vendor files, `icon/` contains artwork, and `logs/` contains runtime output. `obsidian-vault-demo/` is a separate sample Obsidian vault, not part of the utility runtime.

## Build, Test, and Development Commands

There is no build system or automated test suite. On Windows, inspect PowerShell syntax with:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\mic-max\SetAllRenderVolume.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors) { $errors; throw 'PowerShell syntax errors found.' }
```

To exercise the workflow without changing audio settings, first set `DryRun=true` in `mic-max/settings.ini`, then run `mic-max/SetAllRenderVolume.bat`. Review `mic-max/logs/` for matched devices and errors. Only test actual volume changes on a machine where changing audio devices is intended.

## Coding Style & Naming Conventions

Keep the script compatible with Windows PowerShell 5.1. Use four spaces for PowerShell indentation, descriptive `Verb-Noun` function names, and PascalCase parameters/configuration keys consistent with the existing script and INI file. Keep launcher paths relative to the script directory. Preserve the UTF-8 encoding expected by the scripts and localized documentation.

## Testing Guidelines

No test framework or coverage requirement is configured. For script changes, run the parser check above and a `DryRun` launch. For configuration changes, update `settings.example.ini` and verify defaults and parsing; do not replace the machine-specific `settings.ini` without a specific reason. Confirm logs and exit codes for error-path changes.

## Commit & Pull Request Guidelines

The root Git checkout currently has no commit history, so no established commit-message convention can be inferred. Use a short imperative subject, such as `Fix background launcher path handling`. Pull requests should describe behavior changes, list manual validation performed, note Windows/PowerShell assumptions, and include screenshots only when changing visual assets or user-facing UI.

## Security & Configuration Tips

Audio changes are real system changes: use `DryRun=true` before enabling them and inspect target filters carefully. Do not commit machine-specific paths, secrets, or generated logs. Keep bundled SoundVolumeView files and their license/readme intact when modifying or redistributing the utility.
