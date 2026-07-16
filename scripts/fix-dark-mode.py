#!/usr/bin/env python3
"""
Fix hardcoded light-only colors across suivisante/ and smartflow/ components
for proper dark mode support.
"""
import re, os, glob

BASE = '/home/z/my-project/src/components'

# Files to process (both variants)
dirs = ['suivisante', 'smartflow']
files_to_process = [
    'direction-view.tsx',
    'technique-view.tsx',
    'configuration-view.tsx',
    'user-menu.tsx',
    'kanban-view.tsx',
    'dossier-detail.tsx',
    'prestataires-view.tsx',
    'format.ts',
    'portail-view.tsx',
    'assures-view.tsx',
    'chat-view.tsx',
    'users-view.tsx',
    'societes-view.tsx',
    'ia-view.tsx',
    'import-view.tsx',
    'comptabilite-view.tsx',
    'dossiers-view.tsx',
    'reporting-view.tsx',
    'dossier-form.tsx',
    'reception-view.tsx',
]

def fix_direction_view(content: str) -> str:
    """Fix KPI card backgrounds and chart colors for dark mode."""
    # KPI card icon backgrounds - add dark variants
    content = content.replace("bg-sky-50'", "bg-sky-50 dark:bg-sky-950/40'")
    content = content.replace("bg-emerald-50'", "bg-emerald-50 dark:bg-emerald-950/40'")
    content = content.replace("bg-red-50'", "bg-red-50 dark:bg-red-950/40'")
    content = content.replace("bg-amber-50'", "bg-amber-50 dark:bg-amber-950/40'")
    content = content.replace("bg-teal-50'", "bg-teal-50 dark:bg-teal-950/40'")

    # KPI icon text colors - add dark variants
    content = content.replace("text-sky-600'", "text-sky-600 dark:text-sky-400'")
    content = content.replace("text-emerald-600'", "text-emerald-600 dark:text-emerald-400'")
    content = content.replace("text-red-600'", "text-red-600 dark:text-red-400'")
    content = content.replace("text-amber-600'", "text-amber-600 dark:text-amber-400'")
    content = content.replace("text-teal-600'", "text-teal-600 dark:text-teal-400'")

    # Service badge colors - add dark variants
    content = content.replace("bg-sky-100 text-sky-700", "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300")
    content = content.replace("bg-amber-100 text-amber-700", "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300")
    content = content.replace("bg-emerald-100 text-emerald-700", "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300")

    # Recharts grid lines
    content = content.replace('stroke="#e5e7eb"', 'stroke="var(--color-border, #e5e7eb)"')

    return content

def fix_chat_view(content: str) -> str:
    """Fix chat view slate colors."""
    # Step status icons
    content = content.replace('text-slate-300 shrink-0', 'text-muted-foreground/40 shrink-0')
    # Step border backgrounds
    content = content.replace('border-slate-200 bg-slate-50/50', 'border-border bg-muted/50')
    content = content.replace('border-slate-200 bg-slate-50/50 opacity-50', 'border-border bg-muted/50 opacity-50')
    # Step dots
    content = content.replace("'bg-emerald-300'", "'bg-emerald-400 dark:bg-emerald-500'")
    content = content.replace("'bg-slate-200'", "'bg-muted-foreground/30'")
    # Non applicable badge
    content = content.replace('bg-slate-100 text-slate-500 border-slate-200', 'bg-muted text-muted-foreground border-border')
    # ClipboardCheck icon
    content = content.replace('text-slate-500', 'text-muted-foreground')
    return content

def fix_kanban_view(content: str) -> str:
    """Fix kanban card backgrounds."""
    content = content.replace('bg-white cursor-grab', 'bg-card cursor-grab')
    content = content.replace('bg-white shadow-lg', 'bg-card shadow-lg')
    return content

def fix_user_menu(content: str) -> str:
    """Fix role badge colors."""
    # ADMINISTRATEUR - keep emerald (semantic)
    # ACCUEIL
    content = content.replace(
        "bg-blue-100 text-blue-700 border-blue-200",
        "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
    )
    # TECHNIQUE
    content = content.replace(
        "bg-amber-100 text-amber-700 border-amber-200",
        "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800"
    )
    # COMPTABILITE
    content = content.replace(
        "bg-purple-100 text-purple-700 border-purple-200",
        "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800"
    )
    # default
    content = content.replace(
        "bg-gray-100 text-gray-700 border-gray-200",
        "bg-muted text-muted-foreground border-border"
    )
    # Avatar fallback
    content = content.replace(
        "bg-emerald-100 text-emerald-700",
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    )
    return content

def fix_technique_view(content: str) -> str:
    """Fix technique view gray colors."""
    # Rejetes KPI box
    content = content.replace(
        'border-gray-200 bg-gray-50 p-3 text-center',
        'border-border bg-muted p-3 text-center'
    )
    content = content.replace(
        'text-[10px] text-gray-600 uppercase',
        'text-[10px] text-muted-foreground uppercase'
    )
    content = content.replace(
        'text-xl font-bold text-gray-700',
        'text-xl font-bold'
    )
    # Table row backgrounds
    content = content.replace("bg-red-50/50'", "bg-red-500/10'")
    content = content.replace("bg-gray-50/50'", "bg-muted/50'")
    content = content.replace("bg-amber-50/50'", "bg-amber-500/10'")
    return content

def fix_configuration_view(content: str) -> str:
    """Fix configuration view gray text."""
    content = content.replace('text-[10px] text-gray-500"', 'text-[10px] text-muted-foreground"')
    content = content.replace('text-gray-800 whitespace-pre-wrap', 'text-foreground whitespace-pre-wrap')
    return content

def fix_prestataires_view(content: str) -> str:
    """Fix prestataires view."""
    # Specialté badge default
    content = content.replace(
        "bg-gray-100 text-gray-700 border-gray-200",
        "bg-muted text-muted-foreground border-border"
    )
    # Checkbox
    content = content.replace(
        'border-gray-300"',
        'border-border"'
    )
    return content

def fix_format(content: str) -> str:
    """Fix format.ts status color definitions."""
    content = content.replace(
        "bg-slate-100 text-slate-700 border-slate-200",
        "bg-muted text-muted-foreground border-border"
    )
    content = content.replace(
        "bg-gray-100 text-gray-700",
        "bg-muted text-muted-foreground"
    )
    return content

def fix_societes_view(content: str) -> str:
    """Fix societes view."""
    content = content.replace("bg-emerald-50'", "bg-emerald-50 dark:bg-emerald-950/40'")
    content = content.replace("bg-gray-100'", "bg-muted'")
    content = content.replace("text-gray-400'", "text-muted-foreground'")
    content = content.replace('text-gray-500">Inactive', 'text-muted-foreground">Inactive')
    return content

def fix_users_view(content: str) -> str:
    """Fix users view."""
    content = content.replace(
        "bg-gray-100 text-gray-700 border-gray-200",
        "bg-muted text-muted-foreground border-border"
    )
    content = content.replace(
        'border-gray-300"',
        'border-border"'
    )
    return content

def fix_assures_view(content: str) -> str:
    """Fix assures view."""
    content = content.replace(
        'border-gray-300"',
        'border-border"'
    )
    return content

def fix_portail_view(content: str) -> str:
    """Fix portail view - careful with phone mockup."""
    # Step indicator inactive
    content = content.replace(
        'bg-gray-50 border-gray-200 text-gray-400',
        'bg-muted border-border text-muted-foreground'
    )
    # Step dots (non-first)
    content = content.replace("i === 0 ? 'bg-emerald-300' : 'bg-gray-200'", "i === 0 ? 'bg-emerald-400' : 'bg-muted-foreground/30'")
    # Active step
    content = content.replace("i < currentIdx ? 'bg-emerald-500' : 'bg-gray-200'", "i < currentIdx ? 'bg-emerald-500' : 'bg-muted-foreground/30'")
    # Status card neutral
    content = content.replace(
        'bg-gray-50 border border-gray-100 text-gray-700',
        'bg-muted border border-border text-foreground'
    )
    # Cards
    content = content.replace('border-gray-100"', 'border-border"')
    content = content.replace('border-dashed border-gray-200', 'border-dashed border-border')
    # Progress bar bg
    content = content.replace('bg-gray-100 overflow-hidden', 'bg-muted overflow-hidden')
    return content

def fix_dossier_detail(content: str) -> str:
    """Fix dossier detail view."""
    # AUTRE statut
    content = content.replace(
        "bg-gray-50 text-gray-600 border-gray-200",
        "bg-muted text-muted-foreground border-border"
    )
    # Info cards with violet borders
    content = content.replace(
        'bg-white/70 border border-violet-100 p-3 text-center',
        'bg-card/70 border border-violet-200 dark:border-violet-800 p-3 text-center'
    )
    # Timeline line
    content = content.replace('bg-gray-200', 'bg-border')
    # Status dot fallback
    content = content.replace("'bg-gray-400'", "'bg-muted-foreground'")
    # Comment row
    content = content.replace(
        'bg-white hover:bg-gray-50',
        'bg-card hover:bg-muted/50'
    )
    # Paperclip icon
    content = content.replace('text-gray-300 mx-auto', 'text-muted-foreground/40 mx-auto')
    return content

def fix_ia_view(content: str) -> str:
    """Fix IA view progress bar style."""
    # The style width is fine - it's for dynamic width
    return content

def fix_import_view(content: str) -> str:
    """Fix import view."""
    # Border style is using var(--color-primary) which is fine
    # Button style is using hex colors which are fine
    return content

def fix_dossiers_view(content: str) -> str:
    """Generic gray/white fix for dossiers view."""
    content = replace_generic_grays(content)
    content = replace_generic_whites(content)
    return content

def fix_comptabilite_view(content: str) -> str:
    content = replace_generic_grays(content)
    content = replace_generic_whites(content)
    return content

def fix_reporting_view(content: str) -> str:
    content = replace_generic_grays(content)
    content = replace_generic_whites(content)
    return content

def fix_dossier_form(content: str) -> str:
    content = replace_generic_grays(content)
    content = replace_generic_whites(content)
    return content

def fix_reception_view(content: str) -> str:
    content = replace_generic_grays(content)
    content = replace_generic_whites(content)
    return content

def replace_generic_grays(content: str) -> str:
    """Replace common gray patterns that break dark mode."""
    # Background grays
    content = content.replace('bg-gray-50 ', 'bg-muted ')
    content = content.replace('bg-gray-50"', 'bg-muted"')
    content = content.replace('bg-gray-100 ', 'bg-muted ')
    content = content.replace('bg-gray-100"', 'bg-muted"')
    content = content.replace('bg-gray-200 ', 'bg-muted ')
    content = content.replace('bg-gray-200"', 'bg-muted"')

    # Text grays
    content = content.replace('text-gray-300 ', 'text-muted-foreground/50 ')
    content = content.replace('text-gray-400 ', 'text-muted-foreground ')
    content = content.replace('text-gray-500 ', 'text-muted-foreground ')
    content = content.replace('text-gray-600 ', 'text-muted-foreground ')
    content = content.replace('text-gray-700 ', 'text-foreground ')
    content = content.replace('text-gray-800 ', 'text-foreground ')
    content = content.replace('text-gray-900 ', 'text-foreground ')

    # Border grays
    content = content.replace('border-gray-100 ', 'border-border ')
    content = content.replace('border-gray-200 ', 'border-border ')
    content = content.replace('border-gray-300 ', 'border-border ')

    return content

def replace_generic_whites(content: str) -> str:
    """Replace bg-white with theme-aware alternative."""
    # Only replace bg-white that's used as card/item backgrounds (not in portail phone mockup)
    content = re.sub(
        r'bg-white(?![\w/-])',
        'bg-card',
        content
    )
    return content


# Map filenames to their fix functions
fix_fns = {
    'direction-view.tsx': fix_direction_view,
    'chat-view.tsx': fix_chat_view,
    'kanban-view.tsx': fix_kanban_view,
    'user-menu.tsx': fix_user_menu,
    'technique-view.tsx': fix_technique_view,
    'configuration-view.tsx': fix_configuration_view,
    'prestataires-view.tsx': fix_prestataires_view,
    'format.ts': fix_format,
    'societes-view.tsx': fix_societes_view,
    'users-view.tsx': fix_users_view,
    'assures-view.tsx': fix_assures_view,
    'portail-view.tsx': fix_portail_view,
    'dossier-detail.tsx': fix_dossier_detail,
    'dossiers-view.tsx': fix_dossiers_view,
    'comptabilite-view.tsx': fix_comptabilite_view,
    'reporting-view.tsx': fix_reporting_view,
    'dossier-form.tsx': fix_dossier_form,
    'import-view.tsx': fix_import_view,
    'ia-view.tsx': fix_ia_view,
    'reception-view.tsx': fix_reception_view,
}

changed_files = []
for d in dirs:
    for fname in files_to_process:
        fpath = os.path.join(BASE, d, fname)
        if not os.path.exists(fpath):
            continue
        with open(fpath, 'r') as f:
            original = f.read()

        fn = fix_fns.get(fname, replace_generic_grays)
        # Apply both specific fix and generic fixes
        fixed = fn(original)
        # Also apply generic fixes on top (but avoid double-applying)
        if fn != replace_generic_grays:
            fixed = replace_generic_grays(fixed)

        if fixed != original:
            with open(fpath, 'w') as f:
                f.write(fixed)
            changed_files.append(f'{d}/{fname}')

print(f"Changed {len(changed_files)} files:")
for f in changed_files:
    print(f"  ✅ {f}")