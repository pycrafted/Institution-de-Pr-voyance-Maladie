"""
La recherche globale - ce que porte le centre de la barre du haut.

**Pourquoi une recherche globale.** Chaque écran a la sienne, aucune ne
traverse l'application : pour retrouver le bon ``BPI000002``, il fallait
d'abord savoir que c'est un bon de pharmacie, ouvrir cet écran, puis chercher.
Ici, un seul champ interroge les cinq familles d'un coup - participants et
ayants droit, documents, factures, prestataires - et chaque résultat porte
l'adresse de l'écran qui le montre, recherche déjà posée (``?recherche=``).

C'est la règle du module : il ne rend aucune fiche et n'invente aucune route.
Il **oriente** vers la liste qui sait déjà afficher la chose, avec son terme
dans la barre de recherche. Rien à maintenir en double le jour où une liste
change de colonnes.

(Des compteurs d'en-cours ont partagé ce module quelques minutes le
2026-11-26 - documents non traités, factures à payer. Retirés le jour même :
l'utilisateur n'en voulait pas dans la barre.)
"""

from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from documents.models import BonOptique, BonPharmacie, LettreGarantie
from documents.models.lettre_hospitalisation import LettreHospitalisation
from donnees_de_base.models import FournisseurDeSoins
from participants.models import Beneficiaire, Participant
from traitements.models import Facture

# Deux caractères : en deçà, « a » ramènerait la moitié de la base pour rien.
LONGUEUR_MINIMALE = 2
# Par famille. La barre montre une poignée de pistes, pas un résultat de
# requête : pour la liste entière, le lien mène à l'écran, qui pagine.
LIMITE_PAR_FAMILLE = 5

# (modèle, clé, titre, page, champ du prestataire) - les quatre documents, dans
# l'ordre du menu.
DOCUMENTS = (
    (BonPharmacie, 'bons-pharmacie', 'Bons de pharmacie', '/documents/bons-pharmacie', 'pharmacie'),
    (
        LettreGarantie,
        'lettres-garantie',
        'Lettres de garantie',
        '/documents/lettres-garantie',
        'prestataire',
    ),
    (
        LettreHospitalisation,
        'lg-hospitalisation',
        'LG hospitalisation',
        '/documents/lg-hospitalisation',
        'prestataire',
    ),
    (BonOptique, 'bons-optique', 'Bons optique', '/documents/bons-optique', 'fournisseur'),
)


def _nom(objet):
    return f'{objet.prenoms or ""} {objet.nom or ""}'.strip()


def _lien(page, terme):
    """L'écran, sa recherche déjà posée. `terme` est toujours un code ou un
    matricule - jamais un nom : deux personnes peuvent le porter."""
    from urllib.parse import quote

    return f'{page}?recherche={quote(terme)}'


def _groupe(cle, titre, total, elements):
    return {'cle': cle, 'titre': titre, 'total': total, 'elements': elements} if elements else None


def _participants(terme):
    """Participants et ayants droit dans un seul groupe : du point de vue de
    celui qui cherche, c'est la même question - « où est cette personne ? » -
    et un ayant droit se consulte depuis la fiche de son participant."""
    filtre = (
        Q(matricule__icontains=terme) | Q(nom__icontains=terme) | Q(prenoms__icontains=terme)
    )
    base = Participant.objects.filter(filtre).order_by('nom', 'prenoms')
    elements = [
        {
            'titre': _nom(p) or p.matricule,
            'detail': f'Participant · {p.matricule}',
            'lien': _lien('/participants', p.matricule),
        }
        for p in base[:LIMITE_PAR_FAMILLE]
    ]
    total = base.count()

    # Les ayants droit complètent la famille tant qu'il reste de la place.
    reste = LIMITE_PAR_FAMILLE - len(elements)
    filtre_b = Q(nom__icontains=terme) | Q(prenoms__icontains=terme)
    ayants = Beneficiaire.objects.filter(filtre_b).select_related('participant')
    total += ayants.count()
    if reste > 0:
        for b in ayants.order_by('nom', 'prenoms')[:reste]:
            rattache = _nom(b.participant) if b.participant_id else ''
            elements.append({
                'titre': _nom(b) or b.matricule_benef,
                'detail': f'Ayant droit de {rattache}' if rattache else 'Ayant droit',
                'lien': _lien('/participants', b.participant.matricule) if b.participant_id else '/participants',
            })
    return _groupe('participants', 'Participants et ayants droit', total, elements)


def _documents(terme):
    """Un groupe par nature de document : leurs écrans sont distincts, et
    « BPI » ne se cherche pas au même endroit que « BCI »."""
    groupes = []
    for modele, cle, titre, page, champ_prestataire in DOCUMENTS:
        filtre = (
            Q(code__icontains=terme)
            | Q(participant__nom__icontains=terme)
            | Q(participant__prenoms__icontains=terme)
            | Q(participant__matricule__icontains=terme)
            | Q(beneficiaire__nom__icontains=terme)
            | Q(beneficiaire__prenoms__icontains=terme)
            | Q(**{f'{champ_prestataire}__libelle__icontains': terme})
        )
        base = (
            modele.objects.filter(filtre)
            .select_related('participant', 'beneficiaire', champ_prestataire)
            .order_by('-date', '-id')
        )
        elements = []
        for d in base[:LIMITE_PAR_FAMILLE]:
            pour = _nom(d.beneficiaire) if d.beneficiaire_id else _nom(d.participant) if d.participant_id else ''
            jour = d.date.strftime('%d/%m/%Y') if d.date else ''
            elements.append({
                'titre': d.code,
                'detail': ' · '.join(x for x in (jour, pour) if x),
                'lien': _lien(page, d.code),
            })
        groupe = _groupe(cle, titre, base.count(), elements)
        if groupe:
            groupes.append(groupe)
    return groupes


def _factures(terme):
    filtre = (
        Q(numero_fournisseur__icontains=terme)
        | Q(fournisseur_soins__libelle__icontains=terme)
        | Q(fournisseur_divers__libelle__icontains=terme)
    )
    base = (
        Facture.objects.filter(filtre)
        .select_related('fournisseur_soins', 'fournisseur_divers')
        .order_by('-id')
    )
    elements = []
    for f in base[:LIMITE_PAR_FAMILLE]:
        frs = f.fournisseur_soins or f.fournisseur_divers
        jour = f.date_facture.strftime('%d/%m/%Y') if f.date_facture else ''
        elements.append({
            'titre': f.numero_fournisseur or f'Facture n° {f.id}',
            'detail': ' · '.join(x for x in (jour, frs.libelle if frs else '') if x),
            # La liste cherche sur le numéro du fournisseur ; sans numéro, on
            # ouvre l'écran sans terme plutôt que de poser une recherche qui
            # ne trouverait rien.
            'lien': (
                _lien('/traitements/factures', f.numero_fournisseur)
                if f.numero_fournisseur
                else '/traitements/factures'
            ),
        })
    return _groupe('factures', 'Factures', base.count(), elements)


def _fournisseurs(terme):
    base = FournisseurDeSoins.objects.filter(
        Q(code__icontains=terme) | Q(libelle__icontains=terme)
    ).order_by('libelle')
    elements = [
        {
            'titre': f.libelle or f.code,
            'detail': f'Prestataire · {f.code}',
            'lien': _lien('/fournisseurs-de-soins', f.code),
        }
        for f in base[:LIMITE_PAR_FAMILLE]
    ]
    return _groupe('fournisseurs', 'Fournisseurs de soins', base.count(), elements)


class RechercheView(APIView):
    """``GET /api/recherche/?q=...`` - les cinq familles en une requête."""

    def get(self, request):
        terme = (request.query_params.get('q') or '').strip()
        if len(terme) < LONGUEUR_MINIMALE:
            return Response({'q': terme, 'total': 0, 'groupes': []})
        groupes = [
            g
            for g in (_participants(terme), *_documents(terme), _factures(terme), _fournisseurs(terme))
            if g
        ]
        return Response({
            'q': terme,
            'total': sum(g['total'] for g in groupes),
            'groupes': groupes,
        })


# (`EnCoursView` vivait ici : elle comptait les documents non traités et les
# factures à payer pour des pastilles de la barre du haut. Celles-ci ont été
# retirées le jour même de leur pose, l'utilisateur n'en voulant pas ; la vue
# est partie avec elles plutôt que de rester sans appelant.)
