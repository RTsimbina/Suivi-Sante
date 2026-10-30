'use client';

/**
 * Tableau des comptes utilisateurs : identité, badges (rôle, verrou,
 * liaison manquante), statut cliquable (bascule d'activation), dates et
 * actions (édition, suppression en deux temps). Présentateur pur — extraits
 * tels quels de l'ancien monolithe utilisateurs-view.tsx.
 */
import {
  Users, Loader2, Pencil, Trash2, X, Lock, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDate, ROLES, type Utilisateur } from './types';

interface UtilisateursTableProps {
  utilisateurs: Utilisateur[];
  loading: boolean;
  onToggleActif: (user: Utilisateur) => void;
  onEdit: (user: Utilisateur) => void;
  onDelete: (id: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  deleting: boolean;
}

export default function UtilisateursTable({
  utilisateurs, loading, onToggleActif, onEdit, onDelete, deleteConfirm, setDeleteConfirm, deleting,
}: UtilisateursTableProps) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : utilisateurs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Aucun utilisateur trouve</p>
            <p className="text-xs mt-1">Modifiez les filtres ou creez un nouvel utilisateur</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Utilisateur</th>
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Role</th>
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Statut</th>
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">Derniere connexion</th>
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase hidden lg:table-cell">Cree le</th>
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {utilisateurs.map(user => {
                  const isLocked = user.lockoutUntil && new Date(user.lockoutUntil) > new Date();
                  const roleInfo = ROLES.find(r => r.value === user.role);
                  return (
                    <tr key={user.id} className={cn(
                      'hover:bg-muted/20 transition-colors',
                      !user.actif && 'opacity-60'
                    )}>
                      {/* Nom + email */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                            user.actif ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                     : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          )}>
                            {user.nom.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{user.nom}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-2.5 px-3">
                        <Badge className={cn('text-[10px] font-medium', roleInfo?.color || '')}>
                          {user.roleLabel}
                        </Badge>
                        {isLocked && (
                          <Badge className="ml-1 text-[10px] bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Verrouille
                          </Badge>
                        )}
                        {user.liaisonExterne === false && (
                          <Badge
                            className="ml-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 cursor-help"
                            title="Aucun assuré / contact d'entreprise n'a cet e-mail : le portail affichera « Aucun assuré lié à votre compte ». Corrigez l'e-mail de l'assuré (ou du contact) ou celui de ce compte."
                          >
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Liaison manquante
                          </Badge>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => onToggleActif(user)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                            user.actif
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
                              : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60'
                          )}
                          title={user.actif ? 'Cliquer pour desactiver' : 'Cliquer pour activer'}
                        >
                          {user.actif ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {user.actif ? 'Actif' : 'Inactif'}
                        </button>
                      </td>

                      {/* Derniere connexion */}
                      <td className="py-2.5 px-3 text-xs text-muted-foreground hidden md:table-cell">
                        {user.dernierLogin || 'Jamais'}
                      </td>

                      {/* Cree le */}
                      <td className="py-2.5 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {formatDate(user.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                            onClick={() => onEdit(user)}
                            title="Modifier"
                            aria-label="Modifier l'utilisateur"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {deleteConfirm === user.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-[10px] px-2"
                                onClick={() => onDelete(user.id)}
                                disabled={deleting}
                              >
                                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setDeleteConfirm(null)}
                                aria-label="Annuler la suppression"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              onClick={() => setDeleteConfirm(user.id)}
                              title="Supprimer"
                              aria-label="Supprimer l'utilisateur"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
