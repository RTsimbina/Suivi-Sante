'use client';

/**
 * Présentateur de l'onglet Commentaires (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : formulaire d'ajout (texte + visibilité interne) et
 * liste des commentaires existants.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { User, Eye, EyeOff, Send, Loader2 } from 'lucide-react';
import { formatDate } from '../format';
import { cn } from '@/lib/utils';
import type { CommentaireWithAuteur } from './types';

interface CommentairesTabProps {
  commentaires: CommentaireWithAuteur[];
  commentaire: string;
  onCommentaireChange: (valeur: string) => void;
  commentPrive: boolean;
  onTogglePrive: () => void;
  sendingComment: boolean;
  onEnvoyer: () => void;
}

export default function CommentairesTab({
  commentaires,
  commentaire,
  onCommentaireChange,
  commentPrive,
  onTogglePrive,
  sendingComment,
  onEnvoyer,
}: CommentairesTabProps) {
  return (
    <div className="space-y-4">
      {/* Add comment form */}
      <Card className="border-emerald-100 dark:border-emerald-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Textarea
              placeholder="Ajouter un commentaire..."
              className="min-h-[60px] resize-y text-sm"
              rows={2}
              value={commentaire}
              onChange={(e) => onCommentaireChange(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onTogglePrive}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors',
                commentPrive ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {commentPrive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {commentPrive ? 'Commentaire interne' : 'Visible par tous'}
            </button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
              onClick={onEnvoyer}
              disabled={sendingComment || !commentaire.trim()}
            >
              {sendingComment ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" />
              )}
              Envoyer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Comments list */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {commentaires && commentaires.length > 0 ? (
          commentaires.map((c) => (
            <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.auteur?.nom || 'Utilisateur'}</span>
                  {c.prive && (
                    <Badge variant="outline" className="text-[10px] border-amber-200 dark:border-amber-800 text-amber-600 bg-amber-50 dark:bg-amber-950/40">
                      <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                      Interne
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{c.contenu}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun commentaire pour ce dossier
          </p>
        )}
      </div>
    </div>
  );
}
