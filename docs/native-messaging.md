# Native Messaging host

Protocol version: **1.0**. Host name: `com.ytbs.powerfactory.solver`. Chrome MV3 needs only the `nativeMessaging` permission in addition to v6.0 permissions. The Python package pins pandapower 3.5.5. Install on Windows from PowerShell:

```powershell
./native-host/python/scripts/install-windows.ps1 -ExtensionId <32-character Chrome extension ID>
```

Find the ID at `chrome://extensions` with Developer mode enabled. The installer creates a package venv, a `.cmd` launcher, a manifest whose `allowed_origins` contains only that extension, and `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ytbs.powerfactory.solver`. Remove it with `./native-host/python/scripts/uninstall-windows.ps1`. Chrome must be restarted after changing registration if its open process has cached host information.

Messages use Chrome's little endian 32-bit byte length frame and UTF-8 JSON. Every message has `protocolVersion`, `requestId` and `jobId`. Commands: `HELLO`, `CAPABILITIES`, `CREATE_MODEL`, `MODEL_CHUNK`, `MODEL_COMPLETE`, `RUN_LOAD_FLOW`, `PING`, `CANCEL`. Responses: `CAPABILITIES`, `PROGRESS`, `RESULT_SUMMARY`, `RESULT_CHUNK`, `PONG`, `ERROR`. Model chunks are 128 KiB before base64; result chunks are 192 KiB, keeping host-to-Chrome messages below Chrome's 1 MiB limit. Length, order, SHA-256, version and job correlation are checked. The host accepts no path, URL, shell or Python code commands. `CANCEL` applies between commands; a running synchronous pandapower calculation is bounded by the extension's five minute timeout but cannot yet be interrupted in-process.

`HOST NOT INSTALLED` is displayed when Chrome cannot connect. The UI does not relabel Browser Approx. output as a pandapower result. Models and results stay local to the browser and native host. The v5.5 map and SLD remain usable without the host.
