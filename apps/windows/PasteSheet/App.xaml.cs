using System.Drawing;
using System.Threading;
using System.Windows;
using System.Windows.Forms;
using System.Windows.Threading;
using PasteSheet.Data.DataSources;
using PasteSheet.Data.Database;
using PasteSheet.Domain.Repositories;
using PasteSheet.Domain.UseCases;
using PasteSheet.Presentation;
using PasteSheet.Services;
using Application = System.Windows.Application;

namespace PasteSheet.App;

public partial class AppEntry : Application
{
    private MainWindow _window = null!;
    private NotifyIcon _trayIcon = null!;
    private AppViewModel _vm = null!;

    // Single-instance guard. A second launch signals the running instance to
    // surface its panel, then exits — so the exe never opens twice.
    // The mutex and the activation event need distinct kernel-object names:
    // the namespace is shared across types, so reusing one name for both
    // throws WaitHandleCannotBeOpenedException.
    private const string SingleInstanceMutexId = "PasteSheet.SingleInstance.6f1c2a9e";
    private const string ActivationEventId = "PasteSheet.SingleInstance.6f1c2a9e.Activate";
    private Mutex? _singleInstanceMutex;
    private EventWaitHandle? _activationEvent;

    private readonly ClipboardService _clipboardService = new();
    private readonly ForegroundWindowService _foregroundWindowService = new();
    private readonly KeySimulationService _keySimService = new();
    private readonly HotkeyService _hotkeyService = new();
    private readonly MouseEdgeService _mouseEdgeService = new();
    private readonly AutoStartService _autoStartService = new();

    // PS-29: 24h periodic update re-check, plus the last version we notified
    // about so a still-pending release isn't announced again on every tick.
    private DispatcherTimer? _updateTimer;
    private string? _lastNotifiedVersion;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // If another instance is already running, signal it to show and bail out.
        _singleInstanceMutex = new Mutex(initiallyOwned: true, SingleInstanceMutexId, out bool createdNew);
        if (!createdNew)
        {
            try { EventWaitHandle.OpenExisting(ActivationEventId).Set(); }
            catch { /* the other instance may be shutting down; nothing to do */ }
            Shutdown();
            return;
        }

        try { DatabaseManager.Shared.Initialize(); }
        catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"DB init failed: {ex}"); Shutdown(); return; }

        var itemRepo = new PasteItemRepository(new PasteItemDataSource());
        var dirRepo = new DirectoryRepository(new DirectoryDataSource());
        var settingsRepo = new SettingsRepository(new SettingsDataSource());

        var settingsUseCase = new SettingsUseCase(settingsRepo, _mouseEdgeService, _autoStartService);

        // First-run: enable auto-start
        if (settingsUseCase.GetSetting("auto_start") is null)
            settingsUseCase.SetAutoStart(true);

        var edgeEnabled = settingsUseCase.GetSetting("mouse_edge_enabled") != "false";
        _mouseEdgeService.SetEnabled(edgeEnabled);

        _vm = new AppViewModel(
            new ManageItemsUseCase(itemRepo),
            new ManageDirectoriesUseCase(dirRepo),
            new SearchUseCase(),
            new PasteTextUseCase(_clipboardService, _foregroundWindowService, _keySimService),
            new ClipboardMonitorUseCase(itemRepo, _clipboardService),
            settingsUseCase,
            _foregroundWindowService);

        _window = new MainWindow(_vm);
        _vm.Host = _window;

        SetupTray();
        SetupHotkey(settingsUseCase);
        SetupActivationListener();
        StartBackgroundServices();
        CheckForUpdatesAndNotify();
        StartPeriodicUpdateChecks();
    }

    // Listen for a second launch (which signals SingleInstanceId) and surface
    // the panel on the UI thread when it happens.
    private void SetupActivationListener()
    {
        _activationEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivationEventId);
        ThreadPool.RegisterWaitForSingleObject(
            _activationEvent,
            (_, _) => Dispatcher.Invoke(() =>
            {
                _window.SaveForegroundBeforeShow();
                if (!(_vm.Host?.IsVisible ?? false)) _vm.ToggleWindow();
            }),
            null, Timeout.Infinite, executeOnlyOnce: false);
    }

    private async void CheckForUpdatesAndNotify()
    {
        var result = await _vm.CheckUpdateSilentAsync();
        if (result is not { HasUpdate: true } r) return;
        // Same release already announced this session — don't nag on every tick.
        if (r.LatestVersion == _lastNotifiedVersion) return;
        _lastNotifiedVersion = r.LatestVersion;

        _trayIcon.BalloonTipTitle = "PasteSheet update available";
        _trayIcon.BalloonTipText = $"Version {r.LatestVersion} is available. Click to download.";
        _trayIcon.BalloonTipClicked -= OnUpdateBalloonClicked;
        _trayIcon.BalloonTipClicked += OnUpdateBalloonClicked;
        _trayIcon.ShowBalloonTip(8000);
    }

    // Re-check for updates every 24h so long-running instances still catch new
    // releases, reusing the startup check + tray balloon + releases-page flow.
    // ponytail: fixed 24h cadence, auto-download/install intentionally out of
    // scope, and the last-notified version lives in memory only — promote to a
    // setting + persisted store if configurable cadence or cross-restart dedup
    // is ever needed.
    private void StartPeriodicUpdateChecks()
    {
        _updateTimer = new DispatcherTimer { Interval = TimeSpan.FromHours(24) };
        _updateTimer.Tick += (_, _) => CheckForUpdatesAndNotify();
        _updateTimer.Start();
    }

    private void OnUpdateBalloonClicked(object? sender, EventArgs e) => _vm.OpenReleasesPage();

    private void SetupTray()
    {
        var iconStream = GetResourceStream(new Uri("pack://application:,,,/Assets/icon.ico"))?.Stream;
        _trayIcon = new NotifyIcon
        {
            Icon = iconStream != null ? new Icon(iconStream) : SystemIcons.Application,
            Visible = true,
            Text = "PasteSheet"
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Show App", null, (_, _) => _vm.ToggleWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit PasteSheet", null, (_, _) => QuitApp());
        _trayIcon.ContextMenuStrip = menu;

        _trayIcon.MouseClick += (_, args) =>
        {
            if (args.Button == MouseButtons.Left)
            {
                _window.SaveForegroundBeforeShow();
                _vm.ToggleWindow();
            }
        };
    }

    private void SetupHotkey(SettingsUseCase settingsUseCase)
    {
        var shortcut = settingsUseCase.GetSetting("shortcut") ?? Constants.DefaultShortcut;
        _hotkeyService.Register(shortcut, () =>
        {
            _window.SaveForegroundBeforeShow();
            _vm.ToggleWindow();
        });
    }

    private void StartBackgroundServices()
    {
        _vm.ClipboardMonitor.StartMonitoring(() => _vm.OnClipboardUpdated());

        _mouseEdgeService.StartMonitoring(
            Constants.WindowWidth,
            () => _vm.IsWindowVisibleForEdge,
            () => { _window.SaveForegroundBeforeShow(); _vm.ShowWindowFromEdge(); },
            () => _vm.HideWindowFromEdge());
    }

    private void QuitApp()
    {
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _hotkeyService.Dispose();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _updateTimer?.Stop();
        _trayIcon?.Dispose();
        _hotkeyService?.Dispose();
        _activationEvent?.Dispose();
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
