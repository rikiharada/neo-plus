import os

file_path = '/Users/rikiharada/antigravity/Neo+/index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Dashboard '+' Button Exact Centering
html = html.replace(
    '''                        <!-- + New Project Button (44x44 Circular, Thumb zone) -->
                        <button id="btn-create-project"
                            style="background: var(--accent-neo-blue); border: none; color: white; cursor: pointer; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 4px 12px rgba(29, 155, 240, 0.3); transition: transform 0.2s, box-shadow 0.2s; "
                            onmousedown="this.style.transform='scale(0.92)';" onmouseup="this.style.transform='scale(1)';" aria-label="新規プロジェクト">
                            <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
                        </button>''',
    '''                        <!-- + New Project Button (44x44 Circular, Thumb zone) -->
                        <button id="btn-create-project"
                            style="background: var(--accent-neo-blue); border: none; color: white; cursor: pointer; display: block; position: relative; width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 4px 12px rgba(29, 155, 240, 0.3); transition: transform 0.2s, box-shadow 0.2s; "
                            onmousedown="this.style.transform='scale(0.92)';" onmouseup="this.style.transform='scale(1)';" aria-label="新規プロジェクト">
                            <i data-lucide="plus" style="width: 24px; height: 24px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></i>
                        </button>'''
)

# 2. Bottom Nav Flex Removal & Inline-Block Alignment
html = html.replace(
    '<div id="bottom-nav" class="bottom-nav hidden" style="align-items: center !important; justify-content: space-evenly !important;">',
    '<div id="bottom-nav" class="bottom-nav hidden" style="text-align: center; white-space: nowrap; height: 60px;">'
)

# Fix N+ Core button container in Bottom Nav
html = html.replace(
    '''            <!-- THE N+ CORE BUTTON (CEO DIRECTIVE) -->
            <div style="display: grid; place-items: center;">
                <button class="nav-item-nplus" onclick="window.switchView('view-chat')" aria-label="N+ AI Chat"
                    style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #1D9BF0, #0F62FE); color: white; display: grid; place-items: center; box-shadow: 0 4px 15px rgba(29, 155, 240, 0.4); border: 2px solid rgba(255,255,255,0.1); z-index: 999999; position: relative; margin: 0; padding: 0; cursor: pointer;">
                    <span style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro', 'Helvetica Neue', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; display: inline-block;">N<span style="font-size: 16px; font-weight: 800; vertical-align: top; display: inline-block; transform: translateY(-1px);">+</span></span>
                </button>
            </div>''',
    '''            <!-- THE N+ CORE BUTTON (CEO DIRECTIVE) -->
            <div style="display: inline-block; vertical-align: middle; width: 20%; height: 60px; position: relative;">
                <button class="nav-item-nplus" onclick="window.switchView('view-chat')" aria-label="N+ AI Chat"
                    style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #1D9BF0, #0F62FE); color: white; display: block; box-shadow: 0 4px 15px rgba(29, 155, 240, 0.4); border: 2px solid rgba(255,255,255,0.1); z-index: 999999; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0; padding: 0; cursor: pointer;">
                    <span style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro', 'Helvetica Neue', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: block; text-align: center; width: 100%;">N<span style="font-size: 16px; font-weight: 800; vertical-align: top; display: inline-block; transform: translateY(-1px);">+</span></span>
                </button>
            </div>'''
)

# 3. Change the `style="display: block !important;"` on the Projects nav item
html = html.replace('onclick="window.switchView(\'view-sites\'); return false;" style="display: block !important;"', 'onclick="window.switchView(\'view-sites\'); return false;" style="display: inline-block !important;"')


html = html.replace('v=neo-99-RECOVERY12', 'v=neo-99-RECOVERY13')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(html)


css_path = '/Users/rikiharada/antigravity/Neo+/css/layout.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Fix layout.css bottom-nav and nav-item
css = css.replace(
'''/* Bottom Navigation - Icon Only */
.bottom-nav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    background-color: var(--bg-color);
    border-top: 1.2px solid var(--btn-primary-border);
    display: grid; grid-auto-flow: column;
    justify-content: space-around;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 100;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}''',
'''/* Bottom Navigation - Icon Only */
.bottom-nav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    background-color: var(--bg-color);
    border-top: 1.2px solid var(--btn-primary-border);
    display: block;
    text-align: center;
    white-space: nowrap;
    height: 60px;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 100;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}'''
)

css = css.replace(
'''.nav-item {
    
    display: grid; grid-auto-flow: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg) 0;
    /* Taller touch targets */
    color: var(--text-muted);
    transition: color 0.2s ease, opacity 0.2s ease;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    /* Unselected state */
}

.nav-item .lucide {
    width: 26px;
    height: 26px;
    stroke: currentColor;
    stroke-width: 1.5;
    transition: all 0.2s ease;
}''',
'''.nav-item {
    display: inline-block !important; /* Forces override of strict class definitions */
    vertical-align: middle;
    width: 20%;
    height: 60px;
    position: relative;
    padding: 0;
    /* Taller touch targets */
    color: var(--text-muted);
    transition: color 0.2s ease, opacity 0.2s ease;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    /* Unselected state */
}

.nav-item .lucide {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    stroke: currentColor;
    stroke-width: 1.5;
    transition: all 0.2s ease;
}'''
)

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Alignment patch complete.")
