"""
Serializer de la lettre de garantie.

Noms de champs de l'écran (cf. src/views/documents/lettres-garantie/config.js),
repris de l'écran « Edition lettre de garantie » de l'application d'origine.
Les contrôles communs aux documents sont dans commun.py ; la lettre y ajoute
son prestataire, qui doit être de la spécialité choisie.
"""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from participants.models import Participant
from participants.serializers.participant import texte

from ..models import LettreGarantie
from .commun import DocumentBeneficiaireMixin, lien


class LettreGarantieSerializer(DocumentBeneficiaireMixin, serializers.ModelSerializer):
    # Laissé vide à la création, le serveur donne le suivant (« LGI032246 »).
    code = serializers.CharField(
        max_length=12,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=LettreGarantie.objects.all(),
                message='Ce numéro est déjà celui d’une autre lettre de garantie.',
            )
        ],
    )
    # Posée par le serveur à l'établissement.
    date = serializers.DateField(read_only=True)
    exercice = serializers.CharField(read_only=True)

    codeSoc = lien('adherent', Adherent, 'code', 'Société inconnue.')
    matriculePart = lien('participant', Participant, 'matricule', 'Aucun participant ne porte ce matricule.')
    typeBenef = lien('type_benef', TypeBeneficiaire, 'code', 'Type de bénéficiaire inconnu.')
    matriculeBenef = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Prestataire : spécialité, prestataire, nature de la prestation.
    specialitePrestataire = lien('specialite_prestataire', Specialite, 'code', 'Spécialité inconnue.')
    codePrestataire = lien('prestataire', FournisseurDeSoins, 'code', 'Prestataire inconnu.')
    naturePrestation = lien('nature_prestation', TypePrestation, 'code', 'Nature de prestation inconnue.')

    # Prescripteur : spécialité, prescripteur.
    specialite = lien(None, Specialite, 'code', 'Spécialité inconnue.')
    prescripteur = lien(None, FournisseurDeSoins, 'code', 'Prescripteur inconnu.')

    # Noms, lus sur les fiches des tiers.
    participant = serializers.SerializerMethodField()
    beneficiaire = serializers.SerializerMethodField()
    prestataire = serializers.SerializerMethodField()

    numeroFacture = texte('numero_facture')
    # Les actes choisis dans la nomenclature ; le nombre d'articles s'en déduit
    # (cf. validate), il n'est donc pas saisi côté serveur.
    actes = serializers.JSONField(required=False)
    nbArticles = serializers.IntegerField(source='nb_articles', required=False, read_only=True)
    datePrescription = DateOuVide(source='date_prescription')
    remboursementIntegral = serializers.BooleanField(source='remboursement_integral', required=False)

    class Meta:
        model = LettreGarantie
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
            'specialitePrestataire',
            'codePrestataire',
            'prestataire',
            'naturePrestation',
            'numeroFacture',
            'specialite',
            'prescripteur',
            'actes',
            'nbArticles',
            'datePrescription',
            'remboursementIntegral',
            'traite',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    COUPLES_SPECIALITE = DocumentBeneficiaireMixin.COUPLES_SPECIALITE + [
        ('specialite_prestataire', 'prestataire', 'codePrestataire',
         'Ce prestataire n’est pas de la spécialité choisie.'),
    ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # Le nombre d'articles suit le nombre d'actes choisis - comme à l'écran
        # d'origine, où il se remplit tout seul. On nettoie au passage les
        # lignes reçues (code et quantité d'abord ; le tarif se saisit).
        if 'actes' in attrs:
            propres = []
            for ligne in attrs.get('actes') or []:
                if not isinstance(ligne, dict):
                    continue
                code = str(ligne.get('code', '')).strip()
                if not code:
                    continue
                try:
                    quantite = int(ligne.get('quantite') or 1)
                except (TypeError, ValueError):
                    quantite = 1
                try:
                    tarif = int(ligne.get('tarif') or 0)
                except (TypeError, ValueError):
                    tarif = 0
                propres.append({
                    'code': code,
                    'libelle': str(ligne.get('libelle', '')),
                    'specialite': str(ligne.get('specialite', '')),
                    'quantite': max(1, quantite),
                    'tarif': max(0, tarif),
                })
            attrs['actes'] = propres
            attrs['nb_articles'] = len(propres)
        return attrs

    def get_prestataire(self, lettre):
        return lettre.prestataire.libelle if lettre.prestataire_id else ''
