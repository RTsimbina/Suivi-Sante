#!/usr/bin/env python3
"""Patch sante-view.tsx : transformer le simulateur mono-acte en multi-actes."""

FILE = "/home/z/my-project/src/components/smartflow/sante-view.tsx"

with open(FILE, "r") as f:
    c = f.read()

# 1. Ajouter 'Plus, Trash2' aux imports lucide-react
c = c.replace(
    "  Ban, Clock, ArrowRight,",
    "  Ban, Clock, ArrowRight, Plus, Trash2,"
)

# 2. Ajouter l'interface SimLigne
old_search_res = "interface SearchResult {"
new_before = '''interface SimLigne {
  id: string;
  typeActe: string;
  montant: string;
}

interface MultiSimResult {
  ligne: SimLigne;
  result: SimulationResult;
}

'''
c = c.replace(old_search_res, new_before + old_search_res)

# 3. Remplacer les states de simulation mono par multi
old_sim_state = '''  // Simulation
  const [simTypeActe, setSimTypeActe] = useState('');
  const [simMontant, setSimMontant] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);'''

new_sim_state = '''  // Simulation multi-actes
  const [simLignes, setSimLignes] = useState<SimLigne[]>([
    { id: crypto.randomUUID(), typeActe: '', montant: '' },
  ]);
  const [simLoading, setSimLoading] = useState(false);
  const [simResults, setSimResults] = useState<MultiSimResult[]>([]);'''
c = c.replace(old_sim_state, new_sim_state)

# 4. Remplacer le reset dans handleVerifier
old_reset = "setResult(null);\n    setSimResult(null);\n    setShowResults(false);"
new_reset = "setResult(null);\n    setSimResults([]);\n    setSimLignes([{ id: crypto.randomUUID(), typeActe: '', montant: '' }]);\n    setShowResults(false);"
c = c.replace(old_reset, new_reset)

# 5. Lire le fichier et utiliser sed pour le gros remplacement du handler et JSX
with open(FILE, "w") as f:
    f.write(c)

print("Phase 1 OK: types, states, imports patched")
