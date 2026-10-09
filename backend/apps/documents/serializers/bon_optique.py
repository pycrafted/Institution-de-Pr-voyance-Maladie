"""
Serializer du bon optique.

Noms de champs de l'écran (cf. src/views/documents/bons-optique/config.js).
Les contrôles communs aux documents sont dans commun.py ; le bon optique y
ajoute son fournisseur, qui doit être un opticien, et sa remise, qui ne peut
dépasser le montant total.
"""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from participants.models import Participant
from participants.serializers.participant import texte

from ..models import BonOptique
from .commun import DocumentBeneficiaireMixin, lien

# Code de la spécialité « OPTIQUE MEDICALE » : le fournisseur d'un bon optique
# en relève (« 0402 OPTIQUE PONTY » à l'origine).
SPECIALITE_OPTIQUE = '04'


class BonOptiqueSerializer(DocumentBeneficiaireMixin, serializers.ModelSerializer):
    # Laissé vide à la création, le serveur donne le suivant (« BCI000297 »).
    code = serializers.CharField(
        max_length=12,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=BonOptique.objects.all(),
                message='Ce numéro est déjà celui d’un autre bon optique.',
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
    codeFournisseur = lien('fournisseur', FournisseurDeSoins, 'code', 'Fournisseur inconnu.')
    specialite = lien(None, Specialite, 'code', 'Spécialité inconnue.')
    prescripteur = lien(None, FournisseurDeSoins, 'code', 'Prescripteur inconnu.')

    # Noms, lus sur les fiches des tiers.
    participant = serializers.SerializerMethodField()
    beneficiaire = serializers.SerializerMethodField()
    fournisseur = serializers.SerializerMethodField()
    # Qui a établi le bon : « par : … » sous « Crée le », comme sur le bon.
    creePar = serializers.SerializerMethodField()

    numeroFacture = texte('numero_facture')
    dateOrdonnance = DateOuVide(source='date_ordonnance')

    # Les articles optiques, choisis dans la nomenclature (cf. validate pour
    # leur nettoyage) ; les montants s'en calculent.
    actes = serializers.JSONField(required=False)
    remboursementIntegral = serializers.BooleanField(source='remboursement_integral', required=False)
    montantTotal = serializers.IntegerField(source='montant_total', read_only=True)
    montantRemise = serializers.IntegerField(source='montant_remise', required=False, min_value=0)
    montantNet = serializers.IntegerField(source='montant_net', read_only=True)

    class Meta:
        model = BonOptique
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
            'fournisseur',
            'numeroFacture',
            'specialite',
            'prescripteur',
            'dateOrdonnance',
            'actes',
            'remboursementIntegral',
            'montantTotal',
            'montantRemise',
            'montantNet',
            'traite',
            'actif',
            'creePar',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        erreurs = {}

        fournisseur = self._valeur(attrs, 'fournisseur')
        if 'fournisseur' in attrs and fournisseur and (
            fournisseur.specialite is None or fournisseur.specialite.code != SPECIALITE_OPTIQUE
        ):
            erreurs['codeFournisseur'] = ['Ce fournisseur n’est pas un opticien.']

        # Nettoyage des articles reçus : code et quantité d'abord ; le tarif
        # (prix unitaire) se saisit.
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

        # La remise ne peut dépasser le total des articles.
        total = sum(a['quantite'] * a['tarif'] for a in attrs.get('actes', []))
        remise = self._valeur(attrs, 'montant_remise')
        if remise and attrs.get('actes') is not None and remise > total:
            erreurs['montantRemise'] = ['La remise ne peut dépasser le montant total.']

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return attrs

    def get_fournisseur(self, bon):
        return bon.fournisseur.libelle if bon.fournisseur_id else ''

    def get_creePar(self, bon):
        return bon.cree_par.username if bon.cree_par_id else ''
