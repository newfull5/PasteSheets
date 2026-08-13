import SwiftUI

struct DetailModalView: View {
    let item: PasteItem
    let onClose: () -> Void

    @State private var appeared = false

    private var formattedCreatedAt: String {
        let sqlite = DateFormatter()
        sqlite.locale = Locale(identifier: "en_US_POSIX")
        sqlite.timeZone = TimeZone(identifier: "UTC")
        sqlite.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.dateFormat = "yyyy-MM-dd HH:mm"
        if let d = sqlite.date(from: item.createdAt) { return display.string(from: d) }
        return item.createdAt
    }

    /// PS-72: the detail view is the only place an image is shown at full size —
    /// everywhere else it is a capped thumbnail.
    @ViewBuilder
    private var detailBody: some View {
        if item.kind == .image {
            if let image = NSImage(contentsOf: ImageStore.shared.url(for: item.content)) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .padding(24)
            } else {
                Text("Image unavailable")
                    .font(.system(size: 14))
                    .foregroundColor(Color(nsColor: Constants.textTertiary))
                    .padding(24)
            }
        } else {
            Text(item.content)
                .font(.system(size: 14, design: .monospaced))
                .foregroundColor(Color(red: 207/255, green: 207/255, blue: 200/255))
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(24)
                .textSelection(.enabled)
        }
    }

    private func copyToClipboard() {
        NSPasteboard.general.clearContents()
        if item.kind == .image, let png = ImageStore.shared.data(for: item.content) {
            NSPasteboard.general.setData(png, forType: .png)
        } else {
            NSPasteboard.general.setString(item.content, forType: .string)
        }
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.opacity(0.55)
                    .ignoresSafeArea()
                    .onTapGesture { onClose() }

                VStack(spacing: 0) {
                    HStack {
                        Text("Detail")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(Color(nsColor: Constants.textPrimary))
                        Spacer()
                        Button(action: copyToClipboard) {
                            HStack(spacing: 4) {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 11))
                                Text("Copy")
                            }
                            .font(.system(size: 11, weight: .semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(Color(nsColor: Constants.panelBg))
                        .background(Color(nsColor: Constants.accentPrimary))
                        .cornerRadius(Constants.radiusControl)

                        Button(action: { onClose() }) {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(nsColor: Constants.textSecondary))
                                .padding(6)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                    .background(Color(nsColor: Constants.surface))

                    Divider().background(Color(nsColor: Constants.dividerColor))

                    ScrollView {
                        detailBody
                    }
                    .background(Color(nsColor: Constants.panelBg))

                    Divider().background(Color(nsColor: Constants.dividerColor))

                    HStack(spacing: 8) {
                        Text(formattedCreatedAt)
                        Text("·")
                        Text(item.kind == .image ? "Image" : "\(item.content.count) chars")
                        Spacer()
                    }
                    .font(.system(size: 11))
                    .foregroundColor(Color(nsColor: Constants.textTertiary))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(nsColor: Constants.surface))
                }
                .frame(width: geo.size.width * 0.9, height: geo.size.height * 0.8)
                .background(
                    RoundedRectangle(cornerRadius: Constants.radiusCard)
                        .fill(Color(nsColor: Constants.surface))
                        .overlay(RoundedRectangle(cornerRadius: Constants.radiusCard)
                            .stroke(Color(nsColor: Constants.neutralBorder)))
                )
                .clipShape(RoundedRectangle(cornerRadius: Constants.radiusCard))
                .scaleEffect(appeared ? 1 : 0.95)
                .opacity(appeared ? 1 : 0)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .onAppear { withAnimation(.easeInOut(duration: 0.2)) { appeared = true } }
    }
}
