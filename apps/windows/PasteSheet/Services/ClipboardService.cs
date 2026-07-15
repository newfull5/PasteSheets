using System.Runtime.InteropServices;
using Clipboard = System.Windows.Clipboard;

namespace PasteSheet.Services;

/// Wraps the Win32 clipboard. Uses GetClipboardSequenceNumber as the
/// change counter — the Windows equivalent of NSPasteboard.changeCount.
public sealed class ClipboardService
{
    [DllImport("user32.dll")]
    private static extern uint GetClipboardSequenceNumber();

    // PS-43: password managers (1Password, KeePass, browsers) tag clipboard data
    // with these formats to keep secrets out of clipboard history. Honor the tag
    // and skip capture entirely — no history entry, no UI, silent.
    private static readonly string[] SensitiveFormats =
    {
        "Clipboard Viewer Ignore",
        "ExcludeClipboardContentFromMonitorProcessing",
    };

    public string? GetText()
    {
        try
        {
            if (IsSensitive()) return null;
            return Clipboard.ContainsText() ? Clipboard.GetText() : null;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsSensitive()
    {
        foreach (var format in SensitiveFormats)
            if (Clipboard.ContainsData(format)) return true;
        return false;
    }

    public void SetText(string text)
    {
        try
        {
            Clipboard.SetText(text);
        }
        catch
        {
            // Clipboard may be locked by another process; ignore transient failures.
        }
    }

    public bool HasChanged(uint lastChangeCount) =>
        GetClipboardSequenceNumber() != lastChangeCount;

    public uint CurrentChangeCount() => GetClipboardSequenceNumber();
}
