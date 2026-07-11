using System.Globalization;
using System.Windows;
using System.Windows.Data;
using Brush = System.Windows.Media.Brush;
using Color = System.Windows.Media.Color;
using SolidColorBrush = System.Windows.Media.SolidColorBrush;

namespace PasteSheet.Presentation;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var b = value is bool v && v;
        if (Invert) b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Visible when the bound string is null/empty (Invert: when non-empty).
public sealed class StringEmptyToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var empty = string.IsNullOrEmpty(value as string);
        if (Invert) empty = !empty;
        return empty ? Visibility.Visible : Visibility.Collapsed;
    }
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Styles inline action buttons (Paste/Edit/Delete) based on the keyboard
/// focus index. Parameter is "0:gold", "1", "2:danger" etc. — index, optionally
/// flagged as a gold-primary (Paste) or danger (Delete) button. Returns the
/// foreground, background or border brush depending on the Background/Border flags.
public sealed class ActionButtonBrushConverter : IValueConverter
{
    public bool Background { get; set; }
    public bool Border { get; set; }

    // Calm gold palette (macOS 0.6.0 parity).
    private static readonly Brush Accent = Frozen(0xC7, 0xCA, 0x46);       // accentPrimary
    private static readonly Brush FocusBorder = Frozen(0xB9, 0xBC, 0x44);  // focusBorder
    private static readonly Brush Danger = Frozen(0xE2, 0x4B, 0x4A);       // danger (filled)
    private static readonly Brush DangerText = Frozen(0xD8, 0x5A, 0x30);   // quiet trash glyph
    private static readonly Brush TextPrimary = Frozen(0xED, 0xED, 0xE8);
    private static readonly Brush TextSecondary = Frozen(0x9A, 0x9A, 0x92);
    private static readonly Brush PanelBg = Frozen(0x1B, 0x1B, 0x19);
    private static readonly Brush Transparent = FrozenA(0x00, 0x00, 0x00, 0x00);

    private static Brush Frozen(byte r, byte g, byte b)
    {
        var br = new SolidColorBrush(Color.FromRgb(r, g, b));
        br.Freeze();
        return br;
    }
    private static Brush FrozenA(byte a, byte r, byte g, byte b)
    {
        var br = new SolidColorBrush(Color.FromArgb(a, r, g, b));
        br.Freeze();
        return br;
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        int focus = value is int i ? i : -1;
        var parts = (parameter as string ?? "").Split(':');
        int index = int.TryParse(parts[0], out var idx) ? idx : -1;
        bool danger = parts.Length > 1 && parts[1] == "danger";
        bool gold = parts.Length > 1 && parts[1] == "gold";
        bool active = focus == index;

        if (Border)
        {
            // Gold-primary (Paste): borderless when idle, focusBorder ring when keyboard-focused.
            return active ? FocusBorder : Transparent;
        }
        if (Background)
        {
            // Trash (danger) button: no fill when idle, red fill when focused.
            if (danger) return active ? Danger : Transparent;
            // Gold-primary (Paste): always gold fill (macOS goldPrimary parity).
            if (gold) return Accent;
            // Edit: gold fill only when keyboard-focused, else neutral outline (transparent).
            if (active) return Accent;
            return Transparent;
        }
        // Foreground
        if (danger) return active ? TextPrimary : DangerText;
        if (gold) return PanelBg;
        if (active) return PanelBg;
        return TextSecondary;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Confirm-modal button color: danger (red) vs normal (accent). Background flag
/// switches between fill and text color.
public sealed class ConfirmButtonBrushConverter : IValueConverter
{
    public bool Background { get; set; }

    private static readonly Brush Accent = FrozenA(0xFF, 0xC7, 0xCA, 0x46);       // accentPrimary
    private static readonly Brush Danger = FrozenA(0xFF, 0xE2, 0x4B, 0x4A);       // danger
    private static readonly Brush PanelBg = FrozenA(0xFF, 0x1B, 0x1B, 0x19);      // text on gold
    private static readonly Brush TextPrimary = FrozenA(0xFF, 0xED, 0xED, 0xE8);  // text on danger

    private static Brush FrozenA(byte a, byte r, byte g, byte b)
    {
        var br = new SolidColorBrush(Color.FromArgb(a, r, g, b));
        br.Freeze();
        return br;
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        bool danger = value is bool b && b;
        if (Background) return danger ? Danger : Accent;
        return danger ? TextPrimary : PanelBg;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Highlights a segmented timeout button (3/5/10/30/60). The bound value is the
/// currently selected timeout int; the parameter is this button's value.
public sealed class TimeoutSegmentConverter : IValueConverter
{
    public bool Background { get; set; }
    /// When true, returns a FontWeight (SemiBold selected / Medium otherwise)
    /// instead of a brush — so the selected chip reads as emphasized (macOS parity).
    public bool Weight { get; set; }

    private static readonly Brush Selected = FrozenA(0x29, 0xC7, 0xCA, 0x46);     // segment fill (gold @16%, macOS parity; distinct from MatchChip)
    private static readonly Brush TextPrimary = FrozenA(0xFF, 0xED, 0xED, 0xE8);
    private static readonly Brush TextSecondary = FrozenA(0xFF, 0x9A, 0x9A, 0x92);
    private static readonly Brush Transparent = FrozenA(0x00, 0x00, 0x00, 0x00);

    private static Brush FrozenA(byte a, byte r, byte g, byte b)
    {
        var br = new SolidColorBrush(Color.FromArgb(a, r, g, b));
        br.Freeze();
        return br;
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        int selected = value is int i ? i : -1;
        int self = int.TryParse(parameter as string, out var p) ? p : -2;
        bool active = selected == self;
        if (Weight) return active ? FontWeights.SemiBold : FontWeights.Medium;
        if (Background) return active ? Selected : Transparent;
        return active ? TextPrimary : TextSecondary;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Builds the "ITEMS (N)" section header shown above search results.
/// Bound to [Rows, ResultSummary]: ResultSummary changes on every RebuildRows
/// (empty when not searching) and drives re-evaluation; Rows is enumerated to
/// count item rows. Returns "" (→ collapsed) when not searching or 0 items,
/// mirroring the macOS "Items (N)" header that only shows when items exist.
public sealed class SearchItemsHeaderConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        var summary = values.Length > 1 ? values[1] as string : null;
        if (string.IsNullOrEmpty(summary)) return "";                 // not searching
        if (values[0] is not System.Collections.IEnumerable rows) return "";
        int n = 0;
        foreach (var r in rows) if (r is RowItem { IsItem: true }) n++;
        return n > 0 ? $"ITEMS ({n})" : "";
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// Visible when the bound ViewType equals the parameter (e.g. "Settings").
public sealed class ViewTypeVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var match = value is ViewType vt && parameter is string s
                    && string.Equals(vt.ToString(), s, StringComparison.OrdinalIgnoreCase);
        if (Invert) match = !match;
        return match ? Visibility.Visible : Visibility.Collapsed;
    }
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
