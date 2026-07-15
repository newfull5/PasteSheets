using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using PasteSheet.App;
using PasteSheet.Services;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using Point = System.Windows.Point;
using TextBox = System.Windows.Controls.TextBox;

namespace PasteSheet.Presentation;

public partial class MainWindow : Window, IWindowHost
{
    private readonly AppViewModel _vm;
    private readonly WindowPositionService _positionService = new();

    public double DpiScale { get; private set; } = 1.0;

    public MainWindow(AppViewModel vm)
    {
        _vm = vm;
        InitializeComponent();
        DataContext = vm;

        using (var g = System.Drawing.Graphics.FromHwnd(IntPtr.Zero))
            DpiScale = g.DpiX / 96.0;

        _vm.PropertyChanged += OnVmPropertyChanged;
        // PS-34: focus loss alone no longer hides the panel (mac parity — the
        // macOS non-activating panel stays up; only ESC, the auto-hide timer,
        // mouse-edge exit and the paste flow hide it). ponytail: the activating
        // panel still steals focus on show; the full WS_EX_NOACTIVATE
        // non-activating rework lands with PS-19.
        PreviewKeyDown += OnPreviewKeyDown;
        SourceInitialized += (_, _) =>
        {
            DpiScale = VisualTreeHelper.GetDpi(this).DpiScaleX;
            ApplyNonTaskbarStyle();
            ApplyRoundedCorners();
        };
    }

    // MARK: - IWindowHost

    bool IWindowHost.IsVisible => IsVisible;

    private static readonly Duration SlideDuration = new(TimeSpan.FromMilliseconds(Constants.SlideDurationMs));
    private const double SlideOffset = Constants.SlideOffsetPx;

    public void ShowPanel()
    {
        PositionWindow();
        double dockedLeft = Left;

        // Start just off the right edge, transparent, then slide/fade into place.
        BeginAnimation(LeftProperty, null);
        BeginAnimation(OpacityProperty, null);
        Opacity = 0;
        Left = dockedLeft + SlideOffset;
        Show();
        Activate();

        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        BeginAnimation(LeftProperty,
            new DoubleAnimation(dockedLeft + SlideOffset, dockedLeft, SlideDuration) { EasingFunction = ease });
        BeginAnimation(OpacityProperty,
            new DoubleAnimation(0, 1, SlideDuration));

        // PS-20: no SelectAll here — SearchQuery is reset to "" on every show
        // (OnWindowBecameVisible), and a delayed SelectAll would select a first
        // character typed before this invoke runs, letting the next keystroke
        // replace it (macOS PS-13 analogue).
        Dispatcher.BeginInvoke(() => SearchBox.Focus(), DispatcherPriority.Input);
    }

    public void HidePanel()
    {
        if (!IsVisible) return;
        double from = Left;
        var ease = new CubicEase { EasingMode = EasingMode.EaseIn };
        var slide = new DoubleAnimation(from, from + SlideOffset, SlideDuration) { EasingFunction = ease };
        var fade = new DoubleAnimation(Opacity, 0, SlideDuration);
        fade.Completed += (_, _) =>
        {
            BeginAnimation(LeftProperty, null);
            BeginAnimation(OpacityProperty, null);
            Opacity = 1;
            Hide();
        };
        BeginAnimation(LeftProperty, slide);
        BeginAnimation(OpacityProperty, fade);
    }

    public void HidePanelImmediate()
    {
        BeginAnimation(LeftProperty, null);
        BeginAnimation(OpacityProperty, null);
        Opacity = 1;
        Hide();
    }

    public void FocusSearch() => SearchBox.Focus();

    public void SaveForegroundBeforeShow()
    {
        var handle = new WindowInteropHelper(this).Handle;
        _vm.SaveForegroundBeforeShow(handle);
    }

    // MARK: - Window placement / style

    private void PositionWindow()
    {
        var pos = _positionService.CalculatePosition(Constants.WindowWidth, DpiScale);
        Left = pos.X;
        Top = pos.Y;
        Width = pos.Width;
        Height = pos.Height;
    }

    private void ApplyNonTaskbarStyle()
    {
        // Tool window so it never appears in Alt-Tab.
        var helper = new WindowInteropHelper(this);
        const int GWL_EXSTYLE = -20;
        const int WS_EX_TOOLWINDOW = 0x00000080;
        var ex = NativeMethods.GetWindowLong(helper.Handle, GWL_EXSTYLE);
        NativeMethods.SetWindowLong(helper.Handle, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW);
    }

    /// Windows 11 DWM rounded corners — lets us keep AllowsTransparency off
    /// (GPU-accelerated, fast rendering) while still showing rounded corners.
    private void ApplyRoundedCorners()
    {
        try
        {
            var handle = new WindowInteropHelper(this).Handle;
            const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
            int preference = 2; // DWMWCP_ROUND
            NativeMethods.DwmSetWindowAttribute(handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref preference, sizeof(int));
        }
        catch { /* pre-Win11: falls back to square corners */ }
    }

    // MARK: - Keyboard

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        bool isInput = Keyboard.FocusedElement is TextBox;
        var key = e.Key == Key.System ? e.SystemKey : e.Key;

        if (_vm.HandleKey(key, Keyboard.Modifiers, isInput))
            e.Handled = true;
    }

    private void OnVmPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        switch (e.PropertyName)
        {
            case nameof(AppViewModel.HasModal) when _vm.HasModal && _vm.Modal!.ShowInput:
                Dispatcher.BeginInvoke(() => { ModalInput.Focus(); ModalInput.SelectAll(); }, DispatcherPriority.Input);
                break;
            case nameof(AppViewModel.SelectedIndex):
                OnSelectedIndexChanged();
                break;
        }
    }

    // MARK: - Selected-row scroll tracking (PS-38)

    /// mac parity: every selectedIndex *value change* scrolls the selected row to
    /// the vertical center of the viewport with a 0.15s ease-in-out animation —
    /// keyboard, mouse and programmatic changes alike (ItemListView.swift 66-75,
    /// DirectoryListView.swift 55-64, SearchResultView.swift 81-92:
    /// `.onChange(of: vm.selectedIndex) { withAnimation(.easeInOut(0.15)) {
    /// proxy.scrollTo(..., anchor: .center) } }`).
    private static readonly Duration CenterScrollDuration = new(TimeSpan.FromMilliseconds(150));
    private ScrollViewer? _listScroll;
    private int _lastSelectedIndex; // starts at 0, like the VM (onChange semantics: no scroll on appear)
    private bool _centerQueued;

    /// Animation proxy: ScrollViewer.VerticalOffset has no setter DP, so the
    /// DoubleAnimation drives this property and each tick is forwarded to
    /// ScrollToVerticalOffset.
    private static readonly DependencyProperty ListScrollOffsetProperty =
        DependencyProperty.Register("ListScrollOffset", typeof(double), typeof(MainWindow),
            new PropertyMetadata(0.0, (d, e) => ((MainWindow)d)._listScroll?.ScrollToVerticalOffset((double)e.NewValue)));

    private void OnSelectedIndexChanged()
    {
        // The VM re-raises SelectedIndex without a value change (SyncSelection,
        // and the RebuildRows save/restore), and list rebuilds push a transient
        // -1 through the TwoWay binding; mac's onChange fires on real value
        // changes only, so filter both out.
        int index = _vm.SelectedIndex;
        if (index < 0 || index == _lastSelectedIndex) return;
        _lastSelectedIndex = index;
        if (_centerQueued) return;
        _centerQueued = true;
        // Defer past binding/layout so the row expansion of the new selection
        // (wrapped content, action buttons) is measured before centering.
        Dispatcher.BeginInvoke(() => { _centerQueued = false; CenterSelectedRow(); }, DispatcherPriority.Loaded);
    }

    private void CenterSelectedRow()
    {
        if (List.SelectedItem is not { } selected) return;
        _listScroll ??= FindScrollViewer(List);
        if (_listScroll is null) return;

        if (List.ItemContainerGenerator.ContainerFromItem(selected) is not FrameworkElement row)
        {
            // Virtualized out of the viewport: realize the container first.
            List.ScrollIntoView(selected);
            List.UpdateLayout();
            if (List.ItemContainerGenerator.ContainerFromItem(selected) is not FrameworkElement realized) return;
            row = realized;
        }

        double rowTop = _listScroll.VerticalOffset + row.TranslatePoint(new Point(0, 0), _listScroll).Y;
        double target = Math.Clamp(rowTop + row.ActualHeight / 2 - _listScroll.ViewportHeight / 2,
            0, _listScroll.ScrollableHeight);
        BeginAnimation(ListScrollOffsetProperty,
            new DoubleAnimation(_listScroll.VerticalOffset, target, CenterScrollDuration)
            { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut } });
    }

    private static ScrollViewer? FindScrollViewer(DependencyObject root)
    {
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is ScrollViewer sv) return sv;
            if (FindScrollViewer(child) is { } nested) return nested;
        }
        return null;
    }

    // MARK: - Mouse / buttons

    private void OnListDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (List.SelectedItem is not RowItem row) return;
        switch (row.Kind)
        {
            case RowKind.Directory: _vm.ShowItemView(row.Directory!.Name); break;
            case RowKind.Item: _vm.PasteItem(row.Item!); break;
            case RowKind.NewFolder: _vm.StartNewFolder(); break;
            case RowKind.NewItem: _vm.StartNewItem(); break;
        }
    }

    private void OnSettingsClick(object sender, RoutedEventArgs e) => _vm.ShowSettingsView();
    private void OnBackClick(object sender, RoutedEventArgs e) => _vm.ShowDirectoryView();
    private void OnModalConfirm(object sender, RoutedEventArgs e) => _vm.ConfirmModal();
    private void OnModalCancel(object sender, RoutedEventArgs e) => _vm.CancelModal();

    private void OnRowPaste(object sender, RoutedEventArgs e)
    {
        if (RowItemFrom(sender) is { Item: { } item }) _vm.PasteItem(item);
    }

    private void OnRowEdit(object sender, RoutedEventArgs e)
    {
        if (RowItemFrom(sender) is { Item: { } item }) _vm.StartEdit(item);
    }

    private void OnRowDelete(object sender, RoutedEventArgs e)
    {
        if (RowItemFrom(sender) is { Item: { } item }) _vm.DeleteItem(item.Id);
    }

    private void OnDirectoryContextMenuOpening(object sender, ContextMenuEventArgs e)
    {
        // The reserved default folder can't be renamed or deleted (mac parity).
        if (RowItemFrom(sender) is not { Directory: { } dir } || dir.Name == Constants.DefaultDirectory)
            e.Handled = true;
    }

    private void OnDirRename(object sender, RoutedEventArgs e)
    {
        if (RowItemFrom(sender) is { Directory: { } dir }) _vm.RenameDirectory(dir.Name);
    }

    private void OnDirDelete(object sender, RoutedEventArgs e)
    {
        if (RowItemFrom(sender) is { Directory: { } dir }) _vm.DeleteDirectory(dir.Name);
    }

    private void OnInlineSave(object sender, RoutedEventArgs e) => _vm.SaveEdit();
    private void OnInlineCancel(object sender, RoutedEventArgs e) => _vm.CancelEdit();

    private void OnEditBoxLoaded(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb)
            tb.Dispatcher.BeginInvoke(() => { tb.Focus(); Keyboard.Focus(tb); tb.CaretIndex = tb.Text.Length; },
                DispatcherPriority.Input);
    }

    // MARK: - Inline new folder / item

    private void OnNewRowClick(object sender, MouseButtonEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not RowItem row) return;
        if (row.Kind == RowKind.NewFolder) _vm.StartNewFolder();
        else _vm.StartNewItem();
        if (List.Items.Count > 0) List.ScrollIntoView(List.Items[List.Items.Count - 1]);
    }

    private void OnNewSave(object sender, RoutedEventArgs e) => _vm.CommitNew();
    private void OnNewCancel(object sender, RoutedEventArgs e) => _vm.CancelNew();

    /// When the New row's input becomes visible, focus it so the user can type
    /// immediately. IsVisibleChanged is the reliable hook for a templated row.
    private void OnNewInputShown(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is not TextBox tb || !tb.IsVisible) return;
        tb.Dispatcher.BeginInvoke(() =>
        {
            tb.Focus();
            Keyboard.Focus(tb);
            tb.CaretIndex = tb.Text.Length;
        }, DispatcherPriority.Input);
    }

    private static RowItem? RowItemFrom(object sender) =>
        (sender as FrameworkElement)?.DataContext as RowItem;

    // MARK: - Settings handlers

    private void OnTimeoutClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: string tag } && int.TryParse(tag, out var seconds))
            _vm.SetAutoHideTimeout(seconds);
    }

    private void OnCheckUpdatesClick(object sender, RoutedEventArgs e) => _vm.CheckForUpdates();

    // MARK: - Detail modal handlers

    private void OnDetailCopy(object sender, RoutedEventArgs e)
    {
        if (_vm.DetailItem is { } item)
        {
            try { System.Windows.Clipboard.SetText(item.Content); } catch { }
        }
    }

    private void OnDetailClose(object sender, RoutedEventArgs e) => _vm.DetailItem = null;

    private void OnDetailBackdrop(object sender, MouseButtonEventArgs e)
    {
        if (ReferenceEquals(e.OriginalSource, sender)) _vm.DetailItem = null;
    }

    private void OnModalBackdrop(object sender, MouseButtonEventArgs e)
    {
        if (ReferenceEquals(e.OriginalSource, sender)) _vm.CancelModal();
    }

    // MARK: - Resize handle (vertical drag, clamped 300..1400)

    private void OnResizeDrag(object sender, DragDeltaEventArgs e)
    {
        Height = Math.Clamp(Height + e.VerticalChange, Constants.WindowMinHeight, Constants.WindowMaxHeight);
    }

    private void OnResizeCompleted(object sender, DragCompletedEventArgs e) { }
}

internal static class NativeMethods
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
}
