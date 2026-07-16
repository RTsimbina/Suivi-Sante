#!/usr/bin/env python3
"""
Second pass: fix remaining light-only colored backgrounds
(bg-emerald-50, bg-sky-50, bg-amber-50, bg-red-50, bg-teal-50, bg-blue-50)
across all component files for dark mode.
"""
import re, os

BASE = '/home/z/my-project/src/components'
dirs = ['suivisante', 'smartflow']

# Color mappings: light bg -> dark bg variant
bg_mappings = [
    # Pattern: (light_class, dark_class_to_append)
    # KPI icon backgrounds
    ('bg-emerald-50 dark:bg-emerald-950/40', 'bg-emerald-50'),  # already fixed ones
    ('bg-sky-50 dark:bg-sky-950/40', 'bg-sky-50'),
    ('bg-red-50 dark:bg-red-950/40', 'bg-red-50'),
    ('bg-amber-50 dark:bg-amber-950/40', 'bg-amber-50'),
    ('bg-teal-50 dark:bg-teal-950/40', 'bg-teal-50'),
    ('bg-blue-50 dark:bg-blue-950/40', 'bg-blue-50'),
    ('bg-purple-50 dark:bg-purple-950/40', 'bg-purple-50'),
    ('bg-violet-50 dark:bg-violet-950/40', 'bg-violet-50'),
    ('bg-rose-50 dark:bg-rose-950/40', 'bg-rose-50'),
    ('bg-orange-50 dark:bg-orange-950/40', 'bg-orange-50'),
]

# Text color mappings for dark mode
text_mappings = [
    ('text-emerald-700 dark:text-emerald-300', 'text-emerald-700'),
    ('text-emerald-800 dark:text-emerald-300', 'text-emerald-800'),
    ('text-sky-700 dark:text-sky-300', 'text-sky-700'),
    ('text-amber-700 dark:text-amber-300', 'text-amber-700'),
    ('text-red-700 dark:text-red-300', 'text-red-700'),
    ('text-teal-700 dark:text-teal-300', 'text-teal-700'),
    ('text-blue-700 dark:text-blue-300', 'text-blue-700'),
    ('text-purple-700 dark:text-purple-300', 'text-purple-700'),
    ('text-violet-700 dark:text-violet-300', 'text-violet-700'),
]

# Border mappings
border_mappings = [
    ('border-emerald-100 dark:border-emerald-800', 'border-emerald-100'),
    ('border-emerald-200 dark:border-emerald-800', 'border-emerald-200'),
    ('border-emerald-300 dark:border-emerald-700', 'border-emerald-300'),
    ('border-sky-200 dark:border-sky-800', 'border-sky-200'),
    ('border-amber-200 dark:border-amber-800', 'border-amber-200'),
    ('border-red-200 dark:border-red-800', 'border-red-200'),
    ('border-blue-200 dark:border-blue-800', 'border-blue-200'),
    ('border-purple-200 dark:border-purple-800', 'border-purple-200'),
    ('border-violet-200 dark:border-violet-800', 'border-violet-200'),
    ('border-red-50/50 dark:border-red-900/30', 'border-red-50/50'),
]

def apply_mapping(content, dark_variant, light_only):
    """Replace light_only with dark_variant, but only if dark_variant not already present."""
    # Only replace if the dark variant isn't already there
    if dark_variant in content:
        return content  # Already has dark variant
    return content.replace(light_only, dark_variant)

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Apply bg mappings (skip those already having dark variant)
    for dark, light in bg_mappings:
        content = apply_mapping(content, dark, light)
    
    # Apply text mappings
    for dark, light in text_mappings:
        content = apply_mapping(content, dark, light)
    
    # Apply border mappings
    for dark, light in border_mappings:
        content = apply_mapping(content, dark, light)
    
    # Also fix: bg-emerald-50/50 -> bg-emerald-50/50 dark:bg-emerald-950/20
    if 'bg-emerald-50/50' in content and 'bg-emerald-50/50 dark:' not in content:
        content = content.replace('bg-emerald-50/50', 'bg-emerald-50/50 dark:bg-emerald-950/20')
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

changed = []
for d in dirs:
    dirpath = os.path.join(BASE, d)
    if not os.path.exists(dirpath):
        continue
    for fname in sorted(os.listdir(dirpath)):
        if fname.endswith(('.tsx', '.ts')):
            fpath = os.path.join(dirpath, fname)
            if process_file(fpath):
                changed.append(f'{d}/{fname}')

print(f"Second pass: changed {len(changed)} files:")
for f in changed:
    print(f"  ✅ {f}")