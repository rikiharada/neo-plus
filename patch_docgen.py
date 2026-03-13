import os

file_path = '/Users/rikiharada/antigravity/Neo+/index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Release Height Restrictions and Force Scroll on Doc Gen Modal
html = html.replace(
    '<div id="modal-doc-gen" class="modal-overlay hidden" style="z-index: 10000 !important; background: #f8fafc; display: block; width: 100vw; max-width: 100%; height: 100vh; height: 100dvh; min-height: -webkit-fill-available; overflow: hidden; position: fixed; top: 0; left: 0; padding: 0; margin: 0;">',
    '<div id="modal-doc-gen" class="modal-overlay hidden" style="z-index: 10000 !important; background: #f8fafc; display: block; width: 100vw; max-width: 100%; position: fixed; top: 0; left: 0; bottom: 0; right: 0; overflow-y: scroll !important; -webkit-overflow-scrolling: touch; padding: 0; margin: 0;">'
)

# 2. Release Height on Preview Modal as well
html = html.replace(
    '<div id="modal-doc-preview" class="modal-overlay hidden" style="z-index: 10001 !important; background: var(--bg-color); display: block; width: 100vw; max-width: 100%; height: 100vh; height: 100dvh; min-height: -webkit-fill-available; position: fixed; top: 0; left: 0; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">',
    '<div id="modal-doc-preview" class="modal-overlay hidden" style="z-index: 10001 !important; background: var(--bg-color); display: block; width: 100vw; max-width: 100%; position: fixed; top: 0; left: 0; right: 0; bottom: 0; overflow-y: scroll !important; -webkit-overflow-scrolling: touch; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">'
)

# 3. Inner Wrapper adjustments (remove internal overflow-y to pass scroll to parent)
html = html.replace(
    '<div class="doc-gen-inputs-wrapper" style=" overflow-y: auto; width: 100%; margin: 0; padding: 24px 20px 140px 20px; box-sizing: border-box; background: transparent;">',
    '<div class="doc-gen-inputs-wrapper" style="width: 100%; margin: 0; padding: 16px 20px 140px 20px; box-sizing: border-box; background: transparent;">'
)

# 4. Input field padding compression
html = html.replace('padding: 16px; font-size: 16px;', 'padding: 12px 14px; font-size: 15px;')
html = html.replace('margin: 0 0 24px 0;', 'margin: 0 0 16px 0;')

# 5. Fix sticky button safe area
html = html.replace(
    '<div style="position: fixed; bottom: calc(env(safe-area-inset-bottom) + 16px); left: 20px; right: 20px; width: auto; z-index: 20; padding: 0; margin: 0;">',
    '<div style="position: fixed; bottom: 0; left: 0; right: 0; width: 100%; z-index: 20; padding: 16px 20px calc(env(safe-area-inset-bottom) + 40px) 20px; margin: 0; background: linear-gradient(to top, rgba(248,250,252,1) 50%, rgba(248,250,252,0)); box-sizing: border-box; pointer-events: none;">'
)

# Buttons inside sticky div shouldn't lose clickability
html = html.replace(
    '<button onclick="document.getElementById(\'modal-doc-preview\').classList.remove(\'hidden\')"',
    '<button onclick="document.getElementById(\'modal-doc-preview\').classList.remove(\'hidden\')" style="pointer-events: auto; "'
)

# 6. Cache string update
html = html.replace('v=neo-99-RECOVERY11', 'v=neo-99-RECOVERY12')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Patch complete.")
