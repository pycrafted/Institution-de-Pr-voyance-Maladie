# -*- coding: utf-8 -*-
"""
Lecture de la base d'analyse ``lamps_analyse`` (le dump db_sar restauré).

Les commandes ``importer_*`` qui reprennent du réel passent toutes par ici :
un seul endroit sait comment s'y connecter, et aucune n'est nécessaire au
fonctionnement de l'application - elles ne servent qu'à (re)constituer une
base de travail à partir de l'origine.

La base d'analyse est en lecture seule de notre point de vue : on n'y écrit
jamais. Elle vit sur le même cluster que nos bases (port 5433), ce qui
explique les valeurs par défaut.
"""

from django.core.management.base import CommandError

REGLAGES = {
    'base': 'lamps_analyse',
    'hote': '127.0.0.1',
    'port': '5433',
    'utilisateur': 'ipm',
    'motdepasse': '',
}


def ajouter_arguments(parser):
    """Les options de connexion, identiques pour toutes les commandes."""
    for nom, defaut in REGLAGES.items():
        parser.add_argument('--%s' % nom, default=defaut)


def lire(options, requete, parametres=None):
    """Exécute la requête sur la base d'analyse et rend toutes les lignes."""
    try:
        import psycopg
    except ImportError:  # pragma: no cover - dépend de l'environnement
        try:
            import psycopg2 as psycopg
        except ImportError:
            raise CommandError('psycopg (ou psycopg2) est nécessaire pour lire la base.')

    lien = 'host=%s port=%s dbname=%s user=%s' % (
        options.get('hote', REGLAGES['hote']),
        options.get('port', REGLAGES['port']),
        options.get('base', REGLAGES['base']),
        options.get('utilisateur', REGLAGES['utilisateur']),
    )
    if options.get('motdepasse'):
        lien += ' password=%s' % options['motdepasse']
    try:
        with psycopg.connect(lien) as cnx, cnx.cursor() as curseur:
            curseur.execute(requete, parametres or ())
            return curseur.fetchall()
    except CommandError:
        raise
    except Exception as erreur:  # pragma: no cover - dépend de l'environnement
        raise CommandError('Lecture de %s impossible : %s' % (options.get('base'), erreur))


def texte(valeur, longueur=None):
    """Valeur de LAMPS en chaîne propre, tronquée si le champ est plus court."""
    propre = (valeur or '').strip() if isinstance(valeur, str) else ('' if valeur is None else str(valeur))
    propre = ' '.join(propre.split())
    return propre[:longueur] if longueur else propre
