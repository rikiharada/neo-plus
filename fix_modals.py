import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# The entire modal string to move
start_modal = content.find('<!-- New Project Modal -->')
end_modal = content.find('    <!-- Scripts -->')

modals_content = content[start_modal:end_modal]

# The remaining HTML without modals
html_without_modals = content[:start_modal] + content[end_modal:]

# Insert modals just before </body>
body_end = html_without_modals.find('</body>')
final_html = html_without_modals[:body_end] + modals_content + html_without_modals[body_end:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(final_html)

print("Modals moved successfully.")
