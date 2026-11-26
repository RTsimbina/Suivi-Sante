#!/usr/bin/env python3
"""Reconstruit les URI de connexion Neon après rotation du mot de passe.

Usage :
  URI directe : OLD_URI=... ROLE=... NEWPASS=... python3 scripts/neon-rotation-uri.py
  URI pooled  : POOLED_SRC=... python3 scripts/neon-rotation-uri.py --pooled

Les secrets transitent par variables d'environnement (jamais en arguments de
commande, jamais dans les logs). La connexion DIRECTE (sans -pooler) est
requise pour les migrations Prisma ; la connexion POOLED sert au runtime.
"""
import os
import sys
import urllib.parse


def uri_directe(old_uri: str, role: str, password: str) -> str:
    old = old_uri.replace("-pooler.", ".")
    u = urllib.parse.urlsplit(old)
    netloc = (
        f"{urllib.parse.quote(role, safe='')}:"
        f"{urllib.parse.quote(password, safe='')}@{u.hostname}"
    )
    if u.port:
        netloc += f":{u.port}"
    query = [
        (k, v)
        for k, v in urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        if k != "sslmode"
    ]
    query.append(("sslmode", "require"))
    u = u._replace(netloc=netloc, query="&".join(f"{k}={v}" for k, v in query))
    return urllib.parse.urlunsplit(u)


def uri_pooled(src: str) -> str:
    u = urllib.parse.urlsplit(src)
    parts = u.hostname.split(".")
    if not parts[0].endswith("-pooler"):
        parts[0] += "-pooler"
    netloc = f"{u.username}:{u.password}@{'.'.join(parts)}"
    if u.port:
        netloc += f":{u.port}"
    u = u._replace(netloc=netloc)
    return urllib.parse.urlunsplit(u)


if __name__ == "__main__":
    if "--pooled" in sys.argv:
        src = os.environ.get("POOLED_SRC", "")
        if not src:
            sys.exit("POOLED_SRC manquant")
        print(uri_pooled(src))
    else:
        old = os.environ.get("OLD_URI", "")
        role = os.environ.get("ROLE", "")
        pw = os.environ.get("NEWPASS", "")
        if not (old and role and pw):
            sys.exit("OLD_URI / ROLE / NEWPASS manquants")
        print(uri_directe(old, role, pw))
