"""
Cache des documents imprimés (PDF).

Fabriquer un PDF - ouvrir le modèle officiel, effacer ses valeurs, réécrire
celles du document - coûte une à deux secondes sur un petit serveur. Or le
même document s'ouvre souvent plusieurs fois sans avoir changé : sur le
téléphone de l'employé, sur un second appareil, dans l'application IPM.

Le PDF fabriqué est donc gardé, et resservi tant que rien de ce qu'il imprime
n'a bougé. La clé réunit :
  - le document et sa date de modification ;
  - la date de modification de chaque fiche qu'il cite (participant, ayant
    droit, fournisseur, prescripteur…) : une adresse corrigée refait le PDF ;
  - qui l'édite (« par : … » s'imprime) ;
  - la date du modèle officiel, s'il est remplacé.

Conséquence assumée : « édité le » imprime l'heure de la première édition
depuis la dernière modification, et non celle de chaque ouverture.
"""

import hashlib

from django.core.cache import caches

from .modeles import DOSSIER_MODELES

# Une journée : au-delà, le PDF se refait de lui-même (date d'édition fraîche).
DUREE = 24 * 3600


def _empreinte(document, edite_par, variante=''):
    morceaux = [document._meta.label_lower, str(document.pk), str(getattr(document, 'modifie_le', ''))]
    for champ in document._meta.concrete_fields:
        if champ.is_relation and champ.many_to_one:
            lie = getattr(document, champ.name, None)
            if lie is not None:
                morceaux.append(f'{champ.name}:{lie.pk}:{getattr(lie, "modifie_le", "")}')
    morceaux.append(str(getattr(edite_par, 'username', edite_par)))
    morceaux.append(variante)
    try:
        morceaux.append(str(max(p.stat().st_mtime for p in DOSSIER_MODELES.iterdir())))
    except (OSError, ValueError):
        pass
    return 'ipm-pdf:' + hashlib.sha256('|'.join(morceaux).encode()).hexdigest()


def pdf_en_cache(document, edite_par, fabriquer, variante=''):
    """
    Le PDF du document, fabriqué par ``fabriquer(document, edite_par)`` une seule
    fois. ``variante`` distingue deux rendus du même document (« expire » : le
    même PDF, tamponné).
    """
    cache = caches['pdf']
    cle = _empreinte(document, edite_par, variante)
    contenu = cache.get(cle)
    if contenu is None:
        contenu = fabriquer(document, edite_par)
        cache.set(cle, contenu, DUREE)
    return contenu
