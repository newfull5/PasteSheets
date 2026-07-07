using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using Brush = System.Windows.Media.Brush;
using Color = System.Windows.Media.Color;
using SolidColorBrush = System.Windows.Media.SolidColorBrush;

namespace PasteSheet.Presentation;

/// Renders a TextBlock's text with matched substrings of a search query
/// highlighted as a calm gold chip (tinted background + semibold), by splitting
/// the text into Runs. When the query is empty it renders a single run, so
/// non-search rows look identical to a plain Text binding. Mirrors the macOS
/// HistoryItemRow.highlightedText gold-chip match highlight.
public static class Highlight
{
    // Gold chip @ ~18% (matches the MatchChip token #2EC7CA46), text on chip = textPrimary.
    private static readonly Brush Chip = Frozen(0x2E, 0xC7, 0xCA, 0x46);
    private static readonly Brush MatchFg = Frozen(0xFF, 0xED, 0xED, 0xE8);

    private static Brush Frozen(byte a, byte r, byte g, byte b)
    {
        var br = new SolidColorBrush(Color.FromArgb(a, r, g, b));
        br.Freeze();
        return br;
    }

    public static readonly DependencyProperty SourceTextProperty =
        DependencyProperty.RegisterAttached("SourceText", typeof(string), typeof(Highlight),
            new PropertyMetadata(null, OnChanged));
    public static void SetSourceText(DependencyObject o, string v) => o.SetValue(SourceTextProperty, v);
    public static string? GetSourceText(DependencyObject o) => (string?)o.GetValue(SourceTextProperty);

    public static readonly DependencyProperty QueryProperty =
        DependencyProperty.RegisterAttached("Query", typeof(string), typeof(Highlight),
            new PropertyMetadata(null, OnChanged));
    public static void SetQuery(DependencyObject o, string v) => o.SetValue(QueryProperty, v);
    public static string? GetQuery(DependencyObject o) => (string?)o.GetValue(QueryProperty);

    public static readonly DependencyProperty BaseForegroundProperty =
        DependencyProperty.RegisterAttached("BaseForeground", typeof(Brush), typeof(Highlight),
            new PropertyMetadata(null, OnChanged));
    public static void SetBaseForeground(DependencyObject o, Brush v) => o.SetValue(BaseForegroundProperty, v);
    public static Brush? GetBaseForeground(DependencyObject o) => (Brush?)o.GetValue(BaseForegroundProperty);

    private static void OnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TextBlock tb) Rebuild(tb);
    }

    private static void Rebuild(TextBlock tb)
    {
        var text = GetSourceText(tb) ?? "";
        var query = GetQuery(tb) ?? "";
        var baseFg = GetBaseForeground(tb) ?? tb.Foreground;

        tb.Inlines.Clear();
        if (query.Length == 0 || text.Length == 0)
        {
            tb.Inlines.Add(new Run(text) { Foreground = baseFg });
            return;
        }

        int i = 0;
        while (i < text.Length)
        {
            int m = text.IndexOf(query, i, StringComparison.OrdinalIgnoreCase);
            if (m < 0)
            {
                tb.Inlines.Add(new Run(text[i..]) { Foreground = baseFg });
                break;
            }
            if (m > i)
                tb.Inlines.Add(new Run(text[i..m]) { Foreground = baseFg });
            tb.Inlines.Add(new Run(text.Substring(m, query.Length))
            {
                Foreground = MatchFg,
                Background = Chip,
                FontWeight = FontWeights.SemiBold
            });
            i = m + query.Length;
        }
    }
}
