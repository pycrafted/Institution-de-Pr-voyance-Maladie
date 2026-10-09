"""
Serializer du bon de pharmacie.

Noms de champs de l'écran (cf. src/views/documents/bons-pharmacie/config.js).
Les contrôles communs aux documents - société, participant, bénéficiaire,
prescripteur - sont dans commun.py.
"""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from participants.models import Participant
from participants.serializers.participant import texte

from ..models import BonPharmacie
from .commun import DocumentBeneficiaireMixin, lien


class BonPharmacieSerializer(DocumentBeneficiaireMixin, serializers.ModelSerializer):
    # Laissé vide à la création, le serveur donne le suivant (cf.
    # ReferentielViewSet.perform_create et BonPharmacie.prochain_code).
    code = serializers.CharField(
        max_length=12,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=BonPharmacie.objects.all(),
                message='Ce numéro est déjà celui d’un autre bon.',
            )
        ],
    )
    # Posée par le serveur à l'émission.
    date = serializers.DateField(read_only=True)
    exercice = serializers.CharField(read_only=True)

    codeSoc = lien('adherent', Adherent, 'code', 'Société inconnue.')
    matriculePart = lien('participant', Participant, 'matricule', 'Aucun participant ne porte ce matricule.')
    typeBenef = lien('type_benef', TypeBeneficiaire, 'code', 'Type de bénéficiaire inconnu.')
    # Matricule du bénéficiaire, ou du participant lui-même pour le type
    # PARTICIPANT. Résolu dans `validate`, rendu dans `to_representation`.
    matriculeBenef = serializers.CharField(required=False, allow_blank=True, write_only=True)
    codeFournisseur = lien('pharmacie', FournisseurDeSoins, 'code', 'Pharmacie inconnue.')
    specialite = lien(None, Specialite, 'code', 'Spécialité inconnue.')
    prescripteur = lien(None, FournisseurDeSoins, 'code', 'Prescripteur inconnu.')

    # Noms, lus sur les fiches des tiers.
    participant = serializers.SerializerMethodField()
    beneficiaire = serializers.SerializerMethodField()
    pharmacie = serializers.SerializerMethodField()

    numeroFacture = texte('numero_facture')
    # Les médicaments choisis dans le catalogue ; le nombre d'articles s'en
    # déduit (cf. validate), il n'est donc pas saisi côté serveur.
    medicaments = serializers.JSONField(required=False)
    nbArticles = serializers.IntegerField(source='nb_articles', required=False, read_only=True)
    dateOrdonnance = DateOuVide(source='date_ordonnance')
    remboursementIntegral = serializers.BooleanField(source='remboursement_integral', required=False)

    class Meta:
        model = BonPharmacie
        fields = [
            'id',
            'code',
            'date',
            'exercice',
            'codeSoc',
            'matriculePart',
            'participant',
            'typeBenef',
            'matriculeBenef',
            'beneficiaire',
            'codeFournisseur',
            'pharmacie',
            'numeroFacture',
            'specialite',
            'prescripteur',
            'medicaments',
            'nbArticles',
            'dateOrdonnance',
            'remboursementIntegral',
            'traite',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # Le nombre d'articles suit le nombre de médicaments choisis - comme à
        # l'écran d'origine, où il se remplit tout seul. On en profite pour
        # nettoyer les lignes reçues (code et quantité d'abord).
        if 'medicaments' in attrs:
            propres = []
            for ligne in attrs.get('medicaments') or []:
                if not isinstance(ligne, dict):
                    continue
                code = str(ligne.get('code', '')).strip()
                if not code:
                    continue
                try:
                    quantite = int(ligne.get('quantite') or 1)
                except (TypeError, ValueError):
                    quantite = 1
                propres.append({
                    'code': code,
                    'libelle': str(ligne.get('libelle', '')),
                    'quantite': max(1, quantite),
                    'tarif': ligne.get('tarif') or 0,
                    'exclus': bool(ligne.get('exclus', False)),
                })
            attrs['medicaments'] = propres
            attrs['nb_articles'] = len(propres)
        return attrs

    def get_pharmacie(self, bon):
        return bon.pharmacie.libelle if bon.pharmacie_id else ''
