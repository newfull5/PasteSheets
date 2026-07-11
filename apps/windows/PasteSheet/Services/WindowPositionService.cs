using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PasteSheet.Services;

/// Computes the docked window rectangle (right edge, full working-area height)
/// on whichever monitor the cursor is on. WPF coordinates use a top-left origin,
/// unlike macOS, so no Y-flip is needed.
public sealed class WindowPositionService
{
    public readonly record struct WindowPosition(double X, double Y, double Width, double Height);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    private const uint MONITOR_DEFAULTTONEAREST = 2;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    private static Screen ActiveScreen()
    {
        GetCursorPos(out var p);
        return Screen.FromPoint(new System.Drawing.Point(p.X, p.Y));
    }

    /// Returns the docked rect in device-independent units, given the DPI scale.
    public WindowPosition CalculatePosition(double windowWidth, double dpiScale)
    {
        var wa = ActiveScreen().WorkingArea; // physical pixels
        double waX = wa.X / dpiScale;
        double waY = wa.Y / dpiScale;
        double waW = wa.Width / dpiScale;
        double waH = wa.Height / dpiScale;

        double x = waX + waW - windowWidth;
        double y = waY;
        return new WindowPosition(x, y, windowWidth, waH);
    }

    public int CursorX()
    {
        GetCursorPos(out var p);
        return p.X;
    }

    public int RightEdgeX() => ActiveScreen().Bounds.Right;

    /// DPI scale of the monitor under the cursor. The edge-hide width check
    /// compares physical cursor pixels, so the logical panel width must be
    /// scaled by the *cursor's* screen DPI each poll — macOS gets the same
    /// per-screen consistency for free by comparing in logical points.
    public double ActiveScreenDpiScale()
    {
        GetCursorPos(out var p);
        var monitor = MonitorFromPoint(p, MONITOR_DEFAULTTONEAREST);
        return GetDpiForMonitor(monitor, 0, out uint dpiX, out _) == 0 ? dpiX / 96.0 : 1.0;
    }
}
