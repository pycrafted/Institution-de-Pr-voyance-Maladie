# Tests de bout en bout

Scénarios Playwright (`*.spec.ts`), lancés par `npm run e2e` sur les projets
`iphone-13` et `pixel-7` (cf. `playwright.config.ts`, navigateur Edge installé).

- `parcours.spec.ts` : identification d'un vrai participant → nouveau bon
  (5 étapes, génération désactivée hors ligne) → détail avec le PDF rendu par
  pdf.js (canvas non blanc) → le bon est bien renvoyé par l'API IPM
  `GET /api/bons-pharmacie/` (jeton d'un agent staff) → « Mes bons » → hors
  ligne (liste et PDF toujours visibles) → Profil → déconnexion confirmée.
  Plus un refus d'identification.
- `outils.ts` : identification, choix d'une date dans les roues, captures.

## Lancer

Django doit tourner sur une **copie** de `backend/db.sqlite3` (jamais la base
partagée) : c'est ce que fait `lancer-backend-e2e.ps1`, sur le port 8010.

```powershell
# Terminal 1 : Django de test (copie de la base, agent e2e.staff créé dans la copie)
.\e2e\lancer-backend-e2e.ps1

# Terminal 2, dans pwa\
$env:IPM_API_CIBLE = 'http://127.0.0.1:8010'   # vite preview relaie /api vers ce Django
$env:IPM_E2E_JETON_STAFF = '<jeton affiché par le terminal 1>'
$env:IPM_E2E_CAPTURES = "$env:TEMP\ipm-mobile-e2e\captures"   # facultatif
npm run e2e
```

Variables facultatives : `IPM_E2E_MATRICULE` et `IPM_E2E_NAISSANCE`
(participant utilisé, par défaut `01-1204` / `1962-01-01`), `IPM_E2E_CANAL`
(`msedge` ou `chrome`), `IPM_E2E_URL` (PWA déjà servi ailleurs).

Chaque exécution crée un vrai bon dans la copie : relancer le script repart
d'une copie fraîche.
