namespace PasteSheet.Presentation;

public sealed class ModalState
{
    public required string Title { get; init; }
    public required string Message { get; init; }
    public required string ConfirmText { get; init; }
    public string CancelText { get; init; } = "Cancel";
    public bool IsDanger { get; init; }
    public bool ShowInput { get; init; }
    public string InputValue { get; set; } = "";
    /// Optional preview of the target content (delete dialog). Null = no block.
    public string? Preview { get; init; }
    public bool HasPreview => Preview != null;
    /// Preview as displayed: "(empty)" placeholder for empty content (mac parity).
    public string PreviewText => string.IsNullOrEmpty(Preview) ? "(empty)" : Preview;
    /// Danger confirms carry an Enter hint like mac's "Delete  ↵".
    public string ConfirmButtonText => IsDanger ? ConfirmText + "  ↵" : ConfirmText;
    public required Action<string?> OnConfirm { get; init; }
}
