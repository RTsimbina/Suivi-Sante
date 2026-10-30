'use client';

/**
 * Confirmation de suppression d'un courriel (AlertDialog — présentateur pur,
 * extrait tel quel de l'ancien monolithe reception-view.tsx).
 */
import { Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CourrielDeleteAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expediteur?: string | null;
  onSupprimer: () => void;
}

export default function CourrielDeleteAlert({
  open, onOpenChange, expediteur, onSupprimer,
}: CourrielDeleteAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce courriel ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le courriel de <strong>{expediteur}</strong> sera définitivement supprimé.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={onSupprimer}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
