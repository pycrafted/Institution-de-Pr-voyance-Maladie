"""
ViewSet de base des référentiels.

Reflète les fonctions génériques du frontend (services/referentiels.js) :
lister, créer, modifier, désactiver/réactiver, modifier en lot, importer.
Chaque référentiel concret n'a plus qu'à déclarer son ``queryset`` et son
``serializer_class``.
"""

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response


class ReferentielViewSet(viewsets.ModelViewSet):
    """CRUD + activation + import, communs à tous les référentiels."""

    # Au-delà, un import sort de l'usage prévu — reprendre une liste de
    # quelques centaines de fiches — et tiendrait la base occupée le temps de
    # tout valider ligne à ligne.
    TAILLE_MAX_IMPORT = 2000

    @action(detail=True, methods=['post'], url_path='basculer-activation')
    def basculer_activation(self, request, pk=None):
        """
        Désactive (ou réactive) une entrée — équivalent de
        ``basculerActivation`` côté frontend. On ne supprime jamais.
        """
        entree = self.get_object()
        entree.actif = not entree.actif
        entree.save(update_fields=['actif', 'modifie_le'])
        return Response(self.get_serializer(entree).data)

    @action(detail=False, methods=['post'], url_path='modifier-en-lot')
    def modifier_en_lot(self, request):
        """
        Applique les mêmes champs à plusieurs entrées d'un coup — équivalent de
        ``modifierEnLot``. Corps attendu : ``{"ids": [...], "champs": {...}}``.
        """
        ids = request.data.get('ids', [])
        champs = request.data.get('champs', {})
        if not ids or not isinstance(champs, dict):
            return Response(
                {'detail': 'Fournir « ids » (liste) et « champs » (objet).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cibles = self.get_queryset().filter(pk__in=ids)
        # On passe par le serializer pour valider les champs modifiés.
        for entree in cibles:
            serializer = self.get_serializer(entree, data=champs, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()

        return Response({'modifies': cibles.count()})

    @action(detail=False, methods=['post'])
    def importer(self, request):
        """
        Importe un lot de lignes, lues par le frontend dans un fichier Excel.
        Corps attendu : ``{"lignes": [{...}, ...], "simulation": bool}``.

        Chaque ligne met à jour la fiche dont elle porte le numéro (``code``),
        ou en crée une : sous ce numéro s'il est inconnu, sous le numéro
        suivant s'il est vide. Toutes passent par le serializer, donc par les
        mêmes règles qu'une saisie à l'écran.

        Tout ou rien : une seule ligne en erreur et la transaction entière est
        annulée — un fichier à moitié importé serait pire que pas d'import du
        tout. En ``simulation``, tout est validé puis annulé, pour annoncer le
        bilan avant de demander confirmation.

        ``_ligne`` porte le numéro de la ligne dans le fichier : il revient
        avec chaque erreur, pour que l'utilisateur sache où corriger.
        """
        lignes = request.data.get('lignes')
        simulation = bool(request.data.get('simulation'))
        if not isinstance(lignes, list) or not all(isinstance(ligne, dict) for ligne in lignes):
            return Response(
                {'detail': 'Fournir « lignes » : une liste d’objets.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(lignes) > self.TAILLE_MAX_IMPORT:
            return Response(
                {
                    'detail': f'{len(lignes)} lignes : un import en compte au plus '
                    f'{self.TAILLE_MAX_IMPORT}. Scindez le fichier.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        def numero_ligne(i, ligne):
            return ligne.get('_ligne', i + 2)

        # Un même numéro sur deux lignes : laquelle croire ? On refuse plutôt
        # que de laisser la dernière écraser la première en silence.
        premieres = {}
        erreurs = []
        for i, ligne in enumerate(lignes):
            code = str(ligne.get('code') or '').strip()
            if not code:
                continue
            if code in premieres:
                erreurs.append(
                    {
                        'ligne': numero_ligne(i, ligne),
                        'erreurs': {
                            'code': [f'Numéro « {code} » déjà présent ligne {premieres[code]}.']
                        },
                    }
                )
            else:
                premieres[code] = numero_ligne(i, ligne)
        if erreurs:
            return self._bilan_import(simulation, 0, 0, erreurs)

        modele = self.get_queryset().model
        # Numérotation propre au référentiel (``prochain_code``), s'il en a une :
        # appelée ligne après ligne dans la transaction, elle voit les fiches
        # déjà créées par l'import et ne donne jamais deux fois le même numéro.
        numeroter = getattr(modele, 'prochain_code', None)
        existants = {e.code: e for e in self.get_queryset().filter(code__in=list(premieres))}

        crees = modifies = 0
        with transaction.atomic():
            for i, ligne in enumerate(lignes):
                donnees = {cle: valeur for cle, valeur in ligne.items() if not cle.startswith('_')}
                code = str(donnees.pop('code', '') or '').strip()
                instance = existants.get(code)
                if instance is None:
                    if not code:
                        if numeroter is None:
                            erreurs.append(
                                {'ligne': numero_ligne(i, ligne), 'erreurs': {'code': ['Numéro obligatoire.']}}
                            )
                            continue
                        code = numeroter()
                    donnees['code'] = code

                serializer = self.get_serializer(instance, data=donnees, partial=instance is not None)
                if not serializer.is_valid():
                    erreurs.append({'ligne': numero_ligne(i, ligne), 'erreurs': serializer.errors})
                    continue
                serializer.save()
                if instance is None:
                    crees += 1
                else:
                    modifies += 1

            if erreurs or simulation:
                transaction.set_rollback(True)

        return self._bilan_import(simulation, crees, modifies, erreurs)

    @staticmethod
    def _bilan_import(simulation, crees, modifies, erreurs):
        bilan = {'simulation': simulation, 'crees': crees, 'modifies': modifies, 'erreurs': erreurs}
        if erreurs:
            bilan['detail'] = f'{len(erreurs)} ligne(s) en erreur : rien n’a été enregistré.'
            return Response(bilan, status=status.HTTP_400_BAD_REQUEST)
        return Response(bilan)
