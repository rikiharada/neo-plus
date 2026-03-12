with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_str = '                    <!-- Action Menu Dropdown (Enlarged Centered Modal) -->\n                    <div id="project-action-menu"'
if start_str not in content:
    start_str = '<!-- Action Menu Dropdown (Enlarged Centered Modal) -->'
    
start_idx = content.find(start_str)

# Find the end of this block. We know it ends before "</div>\n\n                <!-- Profit Display & Formula -->"
# Let's search for "<!-- Profit Display & Formula -->"
profit_display_idx = content.find('<!-- Profit Display & Formula -->')

# The end of the block should be a couple of divs before profit_display
# Instead, let's just use string replacement on a very specific chunk.
chunk_to_remove = content[start_idx:profit_display_idx]
# Wait, there's another </div> that closes the navbar-area.
# Let's look at the HTML:
"""
                    <!-- Action Menu Dropdown (Enlarged Centered Modal) -->
                    <div id="project-action-menu" ...>
                        ...
                    </div>
                </div>

                <!-- Profit Display & Formula -->
"""
# So the chunk to remove is from start_str up to right before "                </div>\n\n                <!-- Profit Display & Formula -->"
end_str = '                </div>\n\n                <!-- Profit Display & Formula -->'
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    action_menu_chunk = content[start_idx:end_idx]
    
    # We want to insert `action_menu_chunk` just before `<!-- Scripts -->`
    scripts_idx = content.find('    <!-- Scripts -->')
    
    if scripts_idx != -1:
        # Before moving, let's also enforce the width: 100%, height: 100%, top: 0, left: 0, z-index: 99999 !important;
        # on the action_menu_chunk
        old_style = 'style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);"'
        new_style = 'style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999 !important; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);"'
        action_menu_chunk = action_menu_chunk.replace(old_style, new_style)
        
        # Also let's replace inset: 0 on it if the styles didn't match perfectly
        if 'inset: 0;' in action_menu_chunk and old_style not in action_menu_chunk:
             action_menu_chunk = action_menu_chunk.replace('inset: 0;', 'top: 0; left: 0; width: 100%; height: 100%;')
             action_menu_chunk = action_menu_chunk.replace('z-index: 9999;', 'z-index: 99999 !important;')
             
        new_content = content[:start_idx] + content[end_idx:scripts_idx] + action_menu_chunk + content[scripts_idx:]
        
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Action Menu extracted and moved to bottom.")
    else:
        print("Error: Could not find Scripts marker.")
else:
    print("Error: Could not find Action Menu markers.")
