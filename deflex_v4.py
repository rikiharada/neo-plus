import re
import os

target = '/Users/rikiharada/antigravity/Neo+/css/components.css'
with open(target, 'r') as f:
    css = f.read()

# Replace any instance where `display: grid; grid-auto-flow: column;` is followed by `\n    \n` or `\n\n`
# which implies it was originally `flex-direction: column;` that got erased.
# Also fix `.project-list-item-info` explicitly.

fixed_css = re.sub(r'display: grid; grid-auto-flow: column;\n\s*\n', r'display: grid;\n\n', css)

# Explicit fix for project list info (doesn't have blank lines)
fixed_css = fixed_css.replace('.project-list-item-info {\n    padding: 16px;\n    display: grid; grid-auto-flow: column;', '.project-list-item-info {\n    padding: 16px;\n    display: block;')

# Explicit fix for timeline-info
fixed_css = fixed_css.replace('.timeline-info {\n    \n    min-width: 0;\n    /* for ellipsis */\n    display: grid; grid-auto-flow: column;\n    \n    gap: 2px;\n}', '.timeline-info {\n    \n    min-width: 0;\n    /* for ellipsis */\n    display: grid;\n    gap: 2px;\n}')

# Explicit fix for half modal content
fixed_css = fixed_css.replace('.half-modal-content {\n    position: absolute;\n    bottom: 0;\n    left: 0;\n    right: 0;\n    background-color: var(--bg-color);\n    border-radius: 24px 24px 0 0;\n    padding: var(--spacing-lg) var(--spacing-lg) 100px var(--spacing-lg) !important;\n    transform: translateY(100%);\n    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1);\n    display: grid; grid-auto-flow: column;\n    \n    gap: var(--spacing-md);\n    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);\n    max-height: 75vh;\n    overflow-y: auto;\n}', '.half-modal-content {\n    position: absolute;\n    bottom: 0;\n    left: 0;\n    right: 0;\n    background-color: var(--bg-color);\n    border-radius: 24px 24px 0 0;\n    padding: var(--spacing-lg) var(--spacing-lg) 100px var(--spacing-lg) !important;\n    transform: translateY(100%);\n    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1);\n    display: grid;\n    gap: var(--spacing-md);\n    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);\n    max-height: 75vh;\n    overflow-y: auto;\n}')

# Fix .form-group
fixed_css = fixed_css.replace('.form-group {\n    display: grid; grid-auto-flow: column;\n    \n    gap: 4px;\n}', '.form-group {\n    display: grid;\n    gap: 4px;\n}')

with open(target, 'w') as f:
    f.write(fixed_css)

print("Applied strict block rules.")
