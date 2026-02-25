# Auto-Updates & Code Signing Guide

This guide explains how to release a new version of Casper POS Desktop that will automatically download and install for users, without triggering Windows Defender SmartScreen warnings.

## 1. Environment Setup (One-Time)

Before building a release, you need to set up your environment variables on the computer that runs the build command.

### Code Signing Variables

To prevent Windows SmartScreen from blocking the app, you need a valid `.pfx` or `.p12` code signing certificate.

- `WIN_CSC_LINK`: The absolute path to your certificate file (e.g., `C:\certs\casper.pfx`).
- `WIN_CSC_KEY_PASSWORD`: The password for your certificate.

### GitHub Release Variables

Because the app checks a private/public GitHub repository for updates, `electron-builder` needs permission to upload the files.

- `GH_TOKEN`: A GitHub Personal Access Token with `repo` scopes.

You can set these in your terminal before building:

```powershell
$env:WIN_CSC_LINK="C:\certs\casper.pfx"
$env:WIN_CSC_KEY_PASSWORD="your-password"
$env:GH_TOKEN="ghp_yourtoken..."
```

## 2. Releasing an Update

When you are ready to push a new version to all terminals:

1. Update the `"version"` field in `package.json` (e.g., from `"1.0.0"` to `"1.0.1"`).
2. Run the dist command:

   ```bash
   npm run dist
   ```

3. Because the `publish` provider is configured in `package.json`, `electron-builder` will create a rough "Draft Release" on your GitHub repository containing the new `.exe` and the `latest.yml` file.
4. Go to your GitHub repository > Releases > **Publish the draft release**.

## 3. How Users Receive Updates

1. A POS terminal launches the app.
2. Five seconds after booting, it queries the GitHub Releases page.
3. If version `1.0.1` is found, it downloads the `.exe` into a hidden temporary folder.
4. The user sees a newly visible "Restart to Update" button in the Desktop Status widget.
5. Clicking the button restarts the POS instantly to the new version.
