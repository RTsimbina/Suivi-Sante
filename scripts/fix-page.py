import re

with open('/home/z/my-project/src/app/page.tsx', 'r') as f:
    content = f.read()

# 1. Add Shield to the lucide import
content = content.replace(
    'Heart, Stethoscope, Building2, Zap, HeartPulse, Mail,',
    'Heart, Stethoscope, Building2, Zap, HeartPulse, Mail, Shield,'
)

# 2. Add import for JournalView
content = content.replace(
    "import ReceptionView from '@/components/suivisante/reception-view';",
    "import ReceptionView from '@/components/suivisante/reception-view';\nimport JournalView from '@/components/suivisante/journal-view';"
)

# 3. Add 'journal' to the View type
content = content.replace(
    "| 'sante';",
    "| 'sante' | 'journal';"
)

# 4. Add nav item for journal (after configuration)
content = content.replace(
    "  { key: 'configuration', label: 'Configuration Bots', icon: Zap, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },",
    "  { key: 'configuration', label: 'Configuration Bots', icon: Zap, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },\n  { key: 'journal', label: 'Journal de Bord', icon: Shield, section: 'CONFIGURATION', roles: ['ADMINISTRATEUR'] },"
)

# 5. Add view rendering for journal (between configuration and sante)
# Find the line with 'configuration' view rendering and add journal after it
content = content.replace(
    "{view === 'configuration' && <ConfigurationView />}",
    "{view === 'configuration' && <ConfigurationView />}\n          {view === 'journal' && <JournalView />}"
)

with open('/home/z/my-project/src/app/page.tsx', 'w') as f:
    f.write(content)

print('OK: page.tsx updated')
