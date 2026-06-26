import os
import re

def bundle_project():
    workspace_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Read CSS
    css_path = os.path.join(workspace_dir, "style.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()

    # 2. Read JS Files
    calc_path = os.path.join(workspace_dir, "js", "calculator.js")
    with open(calc_path, "r", encoding="utf-8") as f:
        calc_content = f.read()

    templates_path = os.path.join(workspace_dir, "js", "templates.js")
    with open(templates_path, "r", encoding="utf-8") as f:
        templates_content = f.read()

    app_path = os.path.join(workspace_dir, "js", "app.js")
    with open(app_path, "r", encoding="utf-8") as f:
        app_content = f.read()

    # 3. Process JS content to remove import/export statements
    # Remove exports: "export function ..." -> "function ..."
    calc_clean = re.sub(r'\bexport\s+function\b', 'function', calc_content)
    # Remove exports: "export default ..." if any
    calc_clean = re.sub(r'\bexport\s+default\b', '', calc_clean)
    
    templates_clean = re.sub(r'\bexport\s+function\b', 'function', templates_content)
    
    # Remove imports from app.js
    # e.g., import { ... } from './calculator.js';
    app_clean = re.sub(r'import\s+\{[\s\S]*?\}\s+from\s+[\'"].*?[\'"];?', '', app_content)

    # 4. Combine JS
    # We place calculator and templates functions first, then app logic
    combined_js = f"""
// --- openstack Sizing Calculator Module ---
{calc_clean}

// --- OpenStack Templates Module ---
{templates_clean}

// --- Application Core ---
{app_clean}
"""

    # 5. Read index.html
    index_path = os.path.join(workspace_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        index_content = f.read()

    # 6. Replace stylesheet link with inline style
    style_replacement = f"<style>\n{css_content}\n</style>"
    # Use simple replace to avoid regex escape errors
    index_content = index_content.replace('<link rel="stylesheet" href="style.css">', style_replacement)

    # 7. Replace script link with inline script
    script_replacement = f'<script type="text/javascript">\n{combined_js}\n</script>'
    index_content = index_content.replace('<script type="module" src="js/app.js"></script>', script_replacement)

    # 8. Write standalone file
    standalone_path = os.path.join(workspace_dir, "openstack_design_tool_standalone.html")
    with open(standalone_path, "w", encoding="utf-8") as f:
        f.write(index_content)

    print(f"Success: Standalone HTML built successfully at: {standalone_path}")

if __name__ == "__main__":
    bundle_project()
