"""
ViewSet de base des référentiels.

Reflète les fonctions génériques du frontend (services/referentiels.js) :
lister, créer, modifier, désactiver/réactiver, modifier en lot, importer.
Chaque référentiel concret n'a plus qu'à déclarer son ``queryset`` et son
``serializer_class``.
"""

import functools
import math
import operator

from django.core.exceptions import FieldDoesNotExist
from django.db import transaction
from django.db.models import Count, Max, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response


class ReferentielViewSet(viewsets.ModelViewSet):
    """CRUD + activation + import, communs à tous les référentiels."""

    # Au-delà, un import sort de l'usage prévu - reprendre une liste de
    # quelques centaines de fiches - et tiendrait la base occupée le temps de
    # tout valider ligne à ligne.
    TAILLE_MAX_IMPORT = 2000

    # ----- Pagination serveur (opt-in) --------------------------------------
    #
    # Les petits référentiels (quelques dizaines de fiches) partent en entier :
    # le navigateur fait recherche, tri et pagination, instantanément. Les
    # grosses tables (66 429 bons, 396 873 écritures) ne le peuvent pas : la
    # page demande alors une **tranche** au serveur (``?page=1&taille=25``), qui
    # fait recherche, tri et découpe côté base - le tableau ne tient jamais
    # qu'une page en mémoire.
    #
    # Tout est piloté par la présence du paramètre ``page`` : sans lui, la liste
    # répond comme avant (un tableau simple) et rien ne change pour les écrans
    # en mode client. Chaque ViewSet qui veut la pagination serveur déclare les
    # champs où chercher et les tris qu'il accepte.
    TAILLE_PAGE_DEFAUT = 25
    TAILLE_PAGE_MAX = 200
    # Champs (chemins ORM) parcourus par la recherche serveur, en « contient ».
    champs_recherche = ()
    # Tris acceptés : clé envoyée par la page -> liste de champs ``order_by``.
    tris = {}
    # Tri par défaut quand la page n'en demande pas (sinon l'ordre du modèle).
    tri_defaut = None
    # Filtres de liste de la page, déclarés `{param: champ_ORM}` : en mode
    # serveur, les sélecteurs (Société, État, Spécialité…) deviennent des
    # paramètres de requête, et c'est la base qui filtre. Une valeur vide ou
    # « tous » ne filtre rien.
    filtres_liste = {}

    def list(self, request, *args, **kwargs):
        """Tout d'un coup (mode client) ou une tranche (pagination serveur).

        La pagination serveur ne s'active que si la requête porte ``page`` :
        les écrans en mode client n'envoient pas ce paramètre et retrouvent le
        tableau simple d'avant.
        """
        queryset = self.filter_queryset(self.get_queryset())
        if request.query_params.get('page') is None:
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return self._liste_paginee(request, queryset)

    def _liste_paginee(self, request, queryset):
        queryset = self._filtrer_liste(request, queryset)
        queryset = self._rechercher(queryset, request.query_params.get('recherche'))
        queryset = self._trier(queryset, request.query_params.get('tri'))
        total = queryset.count()
        taille = self._entier(
            request.query_params.get('taille'), self.TAILLE_PAGE_DEFAUT, 1, self.TAILLE_PAGE_MAX
        )
        pages = max(1, math.ceil(total / taille))
        page = self._entier(request.query_params.get('page'), 1, 1, pages)
        debut = (page - 1) * taille
        lignes = list(queryset[debut:debut + taille])
        serializer = self.get_serializer(lignes, many=True)
        return Response({
            'resultats': serializer.data,
            'count': total,
            'pages': pages,
            'page': page,
            'taille': taille,
        })

    @staticmethod
    def _entier(valeur, defaut, mini, maxi):
        """Un entier de la requête, borné ; le défaut si absent ou invalide."""
        try:
            nombre = int(valeur)
        except (TypeError, ValueError):
            return defaut
        return max(mini, min(nombre, maxi))

    def _filtrer_liste(self, request, queryset):
        """Applique les filtres de liste déclarés (Société, État…) présents dans la requête."""
        for param, champ in (self.filtres_liste or {}).items():
            valeur = (request.query_params.get(param) or '').strip()
            if valeur and valeur.lower() != 'tous':
                queryset = queryset.filter(**{champ: valeur})
        return queryset

    def _rechercher(self, queryset, terme):
        """Filtre « contient » sur ``champs_recherche`` (OU entre les champs)."""
        terme = (terme or '').strip()
        if not terme or not self.champs_recherche:
            return queryset
        clause = functools.reduce(
            operator.or_,
            (Q(**{'%s__icontains' % champ: terme}) for champ in self.champs_recherche),
        )
        return queryset.filter(clause).distinct()

    def _trier(self, queryset, tri):
        """Applique un tri de ``tris``, sinon ``tri_defaut``, sinon l'ordre du modèle."""
        ordre = self.tris.get((tri or '').strip())
        if ordre:
            return queryset.order_by(*ordre)
        if self.tri_defaut:
            return queryset.order_by(*self.tri_defaut)
        return queryset

    def perform_create(self, serializer):
        # Aucun champ n'est exigé à la saisie, pas même le code : laissé vide,
        # il reçoit le suivant de la numérotation du référentiel.
        if serializer.validated_data.get('code'):
            serializer.save()
        else:
            serializer.save(code=self.get_queryset().model.prochain_code())

    def destroy(self, request, *args, **kwargs):
        """
        Une fiche ne se supprime pas : elle se désactive.

        Règle de l'application (cf. REGISTRE §5) : les dossiers déjà saisis
        pointent sur les entrées des référentiels, et un document comptable
        déjà émis ne s'efface pas. Retirer une ligne ferait perdre le libellé
        de tout ce qui la désigne - une spécialité effacée, et dix ans de bons
        n'affichent plus que « 08 ».

        L'action ``basculer-activation`` est la voie prévue : elle retire
        l'entrée des choix à la saisie sans toucher à l'historique. Le refus
        est ici, dans le socle, et pas seulement dans l'écran : un appel direct
        à l'API doit se heurter à la même règle.
        """
        return Response(
            {
                'detail': 'Une fiche ne se supprime pas : désactivez-la '
                          '(les fiches qui la portent doivent rester lisibles).'
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=['get'], url_path='etat')
    def etat(self, request):
        """
        État compact du jeu de données : ``{"nombre": …, "dernier_changement": …}``.

        Sert à l'écoute de fond du frontend (cf. src/views/donnees-de-base/
        ecouteChangements.js) : un bon émis depuis le mobile doit paraître dans
        le tableau sans que personne ne rafraîchisse la page. Django tourne
        derrière IIS avec quatre fils seulement - ni WebSocket ni requête
        maintenue ouverte, qui immobiliseraient un fil par écran ouvert. Reste
        l'interrogation régulière, qui n'a donc le droit de presque rien coûter.

        D'où une seule requête d'agrégation, sans lecture de ligne ni jointure :
        les ``select_related`` de la liste ne servent qu'à peupler des fiches et
        alourdiraient le SQL pour rien, le tri ne veut rien dire sur un compte.

        Les deux valeurs ensemble suffisent à repérer tout changement : une
        suppression fait baisser le nombre, une création ou une modification
        fait bouger l'une des deux. Un modèle sans ``modifie_le`` - il n'y en a
        pas aujourd'hui, mais rien ne l'impose - se contente du nombre plutôt
        que de faire échouer l'écoute.
        """
        queryset = self.get_queryset().select_related(None).order_by()
        try:
            queryset.model._meta.get_field('modifie_le')
        except FieldDoesNotExist:
            return Response({'nombre': queryset.count(), 'dernier_changement': None})

        resultat = queryset.aggregate(nombre=Count('pk'), dernier_changement=Max('modifie_le'))
        return Response(resultat)

    @action(detail=True, methods=['post'], url_path='basculer-activation')
    def basculer_activation(self, request, pk=None):
        """
        Désactive (ou réactive) une entrée - équivalent de
        ``basculerActivation`` côté frontend. On ne supprime jamais.
        """
        entree = self.get_object()
        entree.actif = not entree.actif
        entree.save(update_fields=['actif', 'modifie_le'])
        return Response(self.get_serializer(entree).data)

    @action(detail=False, methods=['post'], url_path='modifier-en-lot')
    def modifier_en_lot(self, request):
        """
        Applique les mêmes champs à plusieurs entrées d'un coup - équivalent de
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
        annulée - un fichier à moitié importé serait pire que pas d'import du
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
        # Numérotation du référentiel (``prochain_code``) : appelée ligne après
        # ligne dans la transaction, elle voit les fiches déjà créées par
        # l'import et ne donne jamais deux fois le même numéro.
        numeroter = modele.prochain_code
        existants = {e.code: e for e in self.get_queryset().filter(code__in=list(premieres))}

        crees = modifies = 0
        with transaction.atomic():
            for i, ligne in enumerate(lignes):
                donnees = {cle: valeur for cle, valeur in ligne.items() if not cle.startswith('_')}
                code = str(donnees.pop('code', '') or '').strip()
                instance = existants.get(code)
                if instance is None:
                    if not code:
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
