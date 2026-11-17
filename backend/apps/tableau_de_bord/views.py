"""
Agrégats du tableau de bord (page d'accueil).

L'accueil ne charge plus les listes brutes pour compter dans le navigateur :
Postgres fait les comptes, les sommes et les histogrammes, et ne renvoie que
des chiffres (quelques kilo-octets au lieu de plusieurs méga-octets de lignes).

Trois vues indépendantes, pour un rendu progressif côté page :
  - ``tuiles``     : les compteurs du haut (quasi instantané) ;
  - ``graphiques`` : histogramme mensuel, population, répartition par société ;
  - ``listes``     : documents traités, principaux prestataires, derniers émis.

Chacune accepte ``?exercice=2026`` (l'année en cours à défaut). Les compteurs
de personnes ne dépendent pas de l'exercice ; les documents, si.
"""

from datetime import date

from django.db.models import Count, Q
from django.db.models.functions import ExtractMonth
from rest_framework.response import Response
from rest_framework.views import APIView

from documents.models import BonOptique, BonPharmacie, LettreGarantie
from documents.models.lettre_hospitalisation import LettreHospitalisation
from donnees_de_base.models import FournisseurDeSoins
from participants.models import Beneficiaire, Participant

# (modèle, clé front, libellé, nom court, champ du prestataire) - l'ordre et les
# clés sont ceux de DOCUMENTS dans views/tableau-de-bord/Accueil.jsx.
TYPES_DOCUMENT = (
    (BonPharmacie, 'bons-pharmacie', 'Bons de pharmacie', 'Bon de pharmacie', 'pharmacie'),
    (LettreGarantie, 'lettres-garantie', 'Lettres de garantie', 'Lettre de garantie', 'prestataire'),
    (LettreHospitalisation, 'lg-hospitalisation', 'LG hospitalisation', 'LG hospitalisation', 'prestataire'),
    (BonOptique, 'bons-optique', 'Bons optique', 'Bon optique', 'fournisseur'),
)


def _exercice(request):
    valeur = (request.query_params.get('exercice') or '').strip()
    return int(valeur) if valeur.isdigit() else date.today().year


def _documents_actifs(modele, annee):
    """Les documents non annulés de l'exercice (comme l'accueil : actif ≠ faux)."""
    return modele.objects.filter(actif=True, date__year=annee)


def _capitale(texte):
    return texte[:1].upper() + texte[1:].lower() if texte else ''


def _nom(prenoms, nom):
    return f'{prenoms or ""} {nom or ""}'.strip()


class TuilesView(APIView):
    """Les compteurs du haut de l'accueil."""

    def get(self, request):
        annee = _exercice(request)
        total = a_traiter = 0
        for modele, *_ in TYPES_DOCUMENT:
            agg = _documents_actifs(modele, annee).aggregate(
                n=Count('pk'), a=Count('pk', filter=Q(traite=False)),
            )
            total += agg['n']
            a_traiter += agg['a']
        return Response({
            'actifs': Participant.objects.filter(etat='Actif').count(),
            'inscrits': Participant.objects.count(),
            'enAttente': Participant.objects.filter(etat='En Attente').count(),
            'familles': Beneficiaire.objects.filter(actif=True).count(),
            'prestataires': FournisseurDeSoins.objects.filter(actif=True).count(),
            'totalDocuments': total,
            'aTraiter': a_traiter,
        })


class GraphiquesView(APIView):
    """Histogramme mensuel, population couverte, participants par société."""

    def get(self, request):
        annee = _exercice(request)

        par_mois = []
        for modele, cle, libelle, _court, _champ in TYPES_DOCUMENT:
            mois = [0] * 12
            comptes = (
                _documents_actifs(modele, annee)
                .annotate(m=ExtractMonth('date'))
                .values('m')
                .annotate(n=Count('pk'))
            )
            for ligne in comptes:
                if ligne['m']:
                    mois[ligne['m'] - 1] = ligne['n']
            par_mois.append({'cle': cle, 'libelle': libelle, 'mois': mois})

        population = [{
            'libelle': 'Participants',
            'valeur': Participant.objects.filter(etat='Actif').count(),
        }]
        qualites = (
            Beneficiaire.objects.filter(actif=True)
            .values('type_benef__libelle')
            .annotate(n=Count('pk'))
            .order_by('-n')
        )
        for ligne in qualites:
            population.append({
                'libelle': _capitale(ligne['type_benef__libelle']) or 'Autres',
                'valeur': ligne['n'],
            })

        par_societe = [
            {'libelle': ligne['adherent__libelle'], 'valeur': ligne['n']}
            for ligne in (
                Participant.objects.filter(etat='Actif')
                .values('adherent__libelle')
                .annotate(n=Count('pk'))
                .order_by('-n')[:6]
            )
            if ligne['adherent__libelle']
        ]

        return Response({'parMois': par_mois, 'population': population, 'parSociete': par_societe})


class ListesView(APIView):
    """Documents traités par type, principaux prestataires, derniers émis."""

    def get(self, request):
        annee = _exercice(request)

        traitement = []
        for modele, cle, libelle, _court, _champ in TYPES_DOCUMENT:
            agg = _documents_actifs(modele, annee).aggregate(
                total=Count('pk'), traites=Count('pk', filter=Q(traite=True)),
            )
            traitement.append({
                'cle': cle, 'libelle': libelle,
                'total': agg['total'], 'traites': agg['traites'],
            })

        # Principaux prestataires : cumulés sur les quatre types, par libellé.
        compteur = {}
        for modele, _cle, _libelle, _court, champ in TYPES_DOCUMENT:
            comptes = (
                _documents_actifs(modele, annee)
                .values(f'{champ}__libelle')
                .annotate(n=Count('pk'))
            )
            for ligne in comptes:
                nom = ligne[f'{champ}__libelle']
                if nom:
                    compteur[nom] = compteur.get(nom, 0) + ligne['n']
        top = sorted(compteur.items(), key=lambda kv: -kv[1])[:6]
        top_prestataires = [{'libelle': nom, 'valeur': n} for nom, n in top]

        # Derniers documents : les plus récents de chaque type, fondus puis coupés.
        candidats = []
        for modele, cle, _libelle, court, champ in TYPES_DOCUMENT:
            recents = (
                _documents_actifs(modele, annee)
                .select_related('participant', 'beneficiaire', champ)
                .order_by('-date', '-id')[:8]
            )
            for doc in recents:
                prestataire = getattr(doc, champ, None)
                candidats.append({
                    'cle': cle,
                    'court': court,
                    'code': doc.code,
                    'date': doc.date,
                    'participant': _nom(
                        getattr(doc.participant, 'prenoms', ''),
                        getattr(doc.participant, 'nom', ''),
                    ) if doc.participant_id else '',
                    'beneficiaire': _nom(
                        getattr(doc.beneficiaire, 'prenoms', ''),
                        getattr(doc.beneficiaire, 'nom', ''),
                    ) if doc.beneficiaire_id else '',
                    'prestataire': getattr(prestataire, 'libelle', '') or '',
                    'traite': doc.traite,
                })
        candidats.sort(key=lambda x: (x['date'] or date.min, x['code']), reverse=True)
        derniers = candidats[:8]

        return Response({
            'traitement': traitement,
            'topPrestataires': top_prestataires,
            'derniers': derniers,
        })
