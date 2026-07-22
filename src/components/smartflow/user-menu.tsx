'use client';

import { signOut, useSession } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/auth-context';
import type { RoleType } from '@/lib/auth-context';

function getInitials(nom: string): string {
  return nom
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getRoleBadgeVariant(
  role: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (role) {
    case 'ADMINISTRATEUR':
      return 'default';
    case 'TECHNIQUE':
      return 'secondary';
    case 'COMPTABILITE':
      return 'outline';
    case 'SANTE':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'ADMINISTRATEUR':
      return 'bg-emerald-600 text-white border-emerald-600';
    case 'ACCUEIL':
      return 'bg-blue-100 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
    case 'TECHNIQUE':
      return 'bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800';
    case 'COMPTABILITE':
      return 'bg-purple-100 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
    case 'SANTE':
      return 'bg-teal-100 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export default function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  const role = user.role as RoleType;
  const roleLabel = ROLE_LABELS[role] ?? role;
  const initials = getInitials(user.nom);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors cursor-pointer">
          <Avatar className="h-8 w-8">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.nom}
                className="aspect-square size-full"
              />
            ) : (
              <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold">
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-sm font-medium leading-tight">
              {user.nom}
            </span>
            <Badge
              variant={getRoleBadgeVariant(role)}
              className={`text-[10px] h-4 px-1.5 ${getRoleBadgeClass(role)}`}
            >
              {roleLabel}
            </Badge>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.nom}</p>
            <p className="text-xs text-muted-foreground leading-none mt-1">
              {user.email}
            </p>
            <Badge
              variant={getRoleBadgeVariant(role)}
              className={`text-[10px] h-5 w-fit mt-1.5 ${getRoleBadgeClass(role)}`}
            >
              {roleLabel}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          <span>Profil</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Déconnexion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}