"""
Serializer de la lettre de garantie hospitalisation.

Noms de champs de l'écran (cf. src/views/documents/lg-hospitalisation/config.js),
repris de l'écran « Edition Lettre de garantie hospitalisation » de
l'application d'origine. Les contrôles communs aux documents sont dans
commun.py ; la lettre y ajoute sa structure de santé - type, catégorie,
prestataire du type choisi, nature de la prestation, tous exigés - et ses
actes, envoyés et rendus en liste.
"""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from adherents.models import Adherent
from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide
from participants.models import Participant
from participants.serializers.participant import texte

from ..models import LettreHospitalisation
from ..models.lettre_hospitalisation import CATEGORIES, SPECIALITE_DU_TYPE, TYPES_STRUCTURE
from .commun import DocumentBeneficiaireMixin, lien


class EntierOuZero(serializers.IntegerField):
    """Entier facultatif : laissé vide, il vaut 0."""

    def run_validation(self, data=serializers.empty):
        if data in ('', None):
            data = 0
        return super().run_validation(data)


class LettreHospitalisationSerializer(DocumentBeneficiaireMixin, serializers.ModelSerializer):
    # Laissé vide à la création, le serveur donne le suivant.
    code = serializers.CharField(
        max_length=12,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=LettreHospitalisation.objects.all(),
                message='Ce numéro est déjà celui d’une autre lettre de garantie hospitalisation.',
            )
        ],
    )
    date = serializers.DateField(read_only=True)
    exercice = serializers.CharField(read_only=True)

    codeSoc = lien('adherent', Adherent, 'code', 'Société inconnue.')
    matriculePart = lien('participant', Participant, 'matricule', 'Aucun participant ne porte ce matricule.')
    typeBenef = lien('type_benef', TypeBeneficiaire, 'code', 'Type de bénéficiaire inconnu.')
    matriculeBenef = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Structure de santé.
    typeStructure = serializers.ChoiceField(
        source='type_structure',
        choices=TYPES_STRUCTURE,
        required=False,
        allow_blank=True,
        error_messages={'invalid_choice': 'Type de structure inconnu.'},
    )
    categorie = serializers.ChoiceField(
        choices=CATEGORIES,
        required=False,
        allow_blank=True,
        error_messages={'invalid_choice': 'Catégorie inconnue.'},
    )
    codePrestataire = lien('prestataire', FournisseurDeSoins, 'code', 'Prestataire inconnu.')
    naturePrestation = lien('nature_prestation', TypePrestation, 'code', 'Nature de prestation inconnue.')

    # Prescripteur.
    specialite = lien(None, Specialite, 'code', 'Spécialité inconnue.')
    prescripteur = lien(None, FournisseurDeSoins, 'code', 'Prescripteur inconnu.')
    datePrescription = DateOuVide(source='date_prescription')

    # Motif d'hospitalisation. Les actes sont choisis dans la nomenclature et
    # conservés en liste (cf. validate pour leur nettoyage).
    remise = EntierOuZero(required=False, min_value=0)
    actes = serializers.JSONField(required=False)
    remboursementIntegral = serializers.BooleanField(source='remboursement_integral', required=False)

    # Noms, lus sur les fiches des tiers.
    participant = serializers.SerializerMethodField()
    beneficiaire = serializers.SerializerMethodField()
    prestataire = serializers.SerializerMethodField()
    creePar = serializers.SerializerMethodField()

    numeroFacture = texte('numero_facture')

    class Meta:
        model = LettreHospitalisation
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
            'typeStructure',
            'categorie',
            'codePrestataire',
            'prestataire',
            'naturePrestation',
            'numeroFacture',
            'specialite',
            'prescripteur',
            'datePrescription',
            'remise',
            'actes',
            'remboursementIntegral',
            'traite',
            'actif',
            'creePar',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    # L'écran d'origine marque d'un astérisque la Société, le Matricule, le
    # Bénéficiaire (type et bénéficiaire) et la Structure de Santé.
    CHAMPS_REQUIS = {
        **DocumentBeneficiaireMixin.CHAMPS_REQUIS,
        'type_structure': 'typeStructure',
        'categorie': 'categorie',
        'prestataire': 'codePrestataire',
        'nature_prestation': 'naturePrestation',
    }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if 'type_structure' in attrs or 'prestataire' in attrs:
            type_structure = self._valeur(attrs, 'type_structure')
            prestataire = self._valeur(attrs, 'prestataire')
            attendue = SPECIALITE_DU_TYPE.get(type_structure)
            if prestataire and attendue and (
                prestataire.specialite is None or prestataire.specialite.libelle != attendue
            ):
                raise serializers.ValidationError(
                    {'codePrestataire': ['Ce prestataire n’est pas du type de structure choisi.']}
                )
        # Nettoyage des actes reçus : code et quantité d'abord ; le tarif se
        # saisit (tarif de référence souvent 0).
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
        return attrs

    def get_prestataire(self, lettre):
        return lettre.prestataire.libelle if lettre.prestataire_id else ''

    def get_creePar(self, lettre):
        return lettre.cree_par.username if lettre.cree_par_id else ''
