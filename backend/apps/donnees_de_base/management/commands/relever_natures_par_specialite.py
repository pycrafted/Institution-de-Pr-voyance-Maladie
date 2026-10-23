# -*- coding: utf-8 -*-
"""
Relève, dans LAMPS, quelles natures de prestation chaque spécialité couvre.

Écrit ``apps/donnees_de_base/data/natures_par_specialite.json``, le fichier
que lit ``donnees_de_base.natures_courantes`` pour ranger la liste « Nature
prestation » des lettres de garantie (web et mobile).

La source est la base d'analyse ``lamps_analyse`` (le dump db_sar restauré,
cluster PostgreSQL port 5433) : les lettres réelles de ``documents_ipm``
(typedoc LGI et LHI), jointes à ``fournisseurs`` pour connaître la spécialité
du prestataire de chaque lettre. Pour chaque spécialité, on garde les natures
qui couvrent 99 % de ses lettres, de la plus fréquente à la moins fréquente.

La commande ne sert qu'à REFAIRE le relevé (après un nouveau dump) : le
fichier produit est versionné, et l'application n'a jamais besoin de la base
d'analyse pour tourner.

    python manage.py relever_natures_par_specialite
    python manage.py relever_natures_par_specialite --seuil 95
"""

import json
from collections import OrderedDict

from django.core.management.base import BaseCommand, CommandError

from donnees_de_base.natures_courantes import FICHIER, releve

REQUETE = """
    select f.codespe, d.natprest, count(*)
      from documents_ipm d
      join fournisseurs f on f.numfourn = d.codefourn
     where d.typedoc in ('LGI', 'LHI')
       and coalesce(d.natprest, '') <> ''
     group by 1, 2
     order by 1, 3 desc
"""


class Command(BaseCommand):
    help = "Relève dans lamps_analyse les natures de prestation par spécialité."

    def add_arguments(self, parser):
        parser.add_argument('--base', default='lamps_analyse')
        parser.add_argument('--hote', default='127.0.0.1')
        parser.add_argument('--port', default='5433')
        parser.add_argument('--utilisateur', default='ipm')
        parser.add_argument('--motdepasse', default='')
        parser.add_argument(
            '--seuil',
            type=float,
            default=99.0,
            help='Part des lettres à couvrir, en %% (99 par défaut).',
        )

    def handle(self, *args, **options):
        try:
            import psycopg
        except ImportError:  # pragma: no cover - dépend de l'environnement
            try:
                import psycopg2 as psycopg
            except ImportError:
                raise CommandError('psycopg (ou psycopg2) est nécessaire pour lire la base.')

        lien = 'host=%s port=%s dbname=%s user=%s' % (
            options['hote'],
            options['port'],
            options['base'],
            options['utilisateur'],
        )
        if options['motdepasse']:
            lien += ' password=%s' % options['motdepasse']
        try:
            with psycopg.connect(lien) as cnx, cnx.cursor() as curseur:
                curseur.execute(REQUETE)
                brut = curseur.fetchall()
        except Exception as erreur:  # pragma: no cover - dépend de l'environnement
            raise CommandError('Lecture de %s impossible : %s' % (options['base'], erreur))

        par_specialite = OrderedDict()
        for codespe, natprest, nombre in brut:
            par_specialite.setdefault(codespe.strip(), []).append((natprest.strip(), nombre))

        seuil, lignes = options['seuil'], []
        for codespe in sorted(par_specialite):
            observees = sorted(par_specialite[codespe], key=lambda couple: -couple[1])
            total = sum(nombre for _, nombre in observees)
            cumul, gardees = 0.0, []
            for nature, nombre in observees:
                gardees.append(nature)
                cumul += 100.0 * nombre / total
                if cumul >= seuil:
                    break
            lignes.append(
                {'specialite': codespe, 'observations': total, 'natures': gardees}
            )

        with open(FICHIER, 'w', encoding='utf-8', newline='\n') as flux:
            json.dump(lignes, flux, ensure_ascii=False, indent=1)
            flux.write('\n')
        releve.cache_clear()

        couples = sum(len(ligne['natures']) for ligne in lignes)
        lettres = sum(ligne['observations'] for ligne in lignes)
        self.stdout.write(
            self.style.SUCCESS(
                '%s : %d spécialités, %d natures retenues, sur %d lettres réelles.'
                % (FICHIER.name, len(lignes), couples, lettres)
            )
        )
