"""
Serializers des participants et de leurs bénéficiaires.

Le frontend nomme ses champs en camelCase (« dateNaissance », « typeContrat »),
la base en snake_case : ``source`` fait le pont, comme pour les adhérents et
les fournisseurs.
"""

import re
from datetime import date

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from adherents.models import Adherent
from donnees_de_base.models import TypeBeneficiaire
from donnees_de_base.serializers.fournisseur_de_soins import DateOuVide

from ..models import Beneficiaire, Participant
from ..models.participant import SORTIES

# Libellé du type « le participant lui-même » dans le référentiel.
TYPE_PARTICIPANT = 'PARTICIPANT'

# Âge minimum à l'embauche. L'application d'origine ne connaît pas de salarié
# recruté enfant : une date d'embauche antérieure est une faute de frappe.
AGE_MINIMUM_EMBAUCHE = 16

# Le conjoint d'une femme est un époux, celui d'un homme une épouse : le type
# de bénéficiaire et le sexe se répondent. Les autres types (enfant,
# ascendant) n'imposent rien.
SEXE_DU_CONJOINT = {'EPOUSE': 'F', 'EPOUX': 'M'}


def texte(source):
    """Champ texte facultatif, mappé sur sa colonne snake_case."""
    return serializers.CharField(source=source, required=False, allow_blank=True)


class ChampsRequisMixin:
    """
    Champs exigés par la fiche (``CHAMPS_REQUIS`` : champ du modèle → nom du
    champ à l'écran, sous lequel l'erreur se pose). En modification partielle -
    changement d'état en lot, par exemple -, un champ non envoyé garde sa
    valeur : on le juge sur celle de la fiche.
    """

    CHAMPS_REQUIS = {}

    def validate(self, attrs):
        erreurs = {}
        for champ, nom in self.CHAMPS_REQUIS.items():
            valeur = attrs[champ] if champ in attrs else getattr(self.instance, champ, None)
            if valeur is None or (isinstance(valeur, str) and not valeur.strip()):
                erreurs[nom] = ['Champ obligatoire.']
        if erreurs:
            raise serializers.ValidationError(erreurs)
        return super().validate(attrs)


class ParticipantSerializer(ChampsRequisMixin, serializers.ModelSerializer):
    # Obligatoire, mais contrôlé avec les autres (CHAMPS_REQUIS) pour un même
    # message ; le doublon, lui, se dit ici.
    matricule = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        validators=[
            UniqueValidator(
                queryset=Participant.objects.all(),
                message='Ce matricule est déjà celui d’un autre participant.',
            )
        ],
    )
    # La société circule par son code (« 01 »), comme dans le filtre et le
    # tableau. Le queryset refuse un code inconnu.
    adherent = serializers.SlugRelatedField(
        slug_field='code',
        queryset=Adherent.objects.all(),
        required=False,
        allow_null=True,
        error_messages={'does_not_exist': 'Société inconnue.'},
    )

    # Déduit du régime de la société (cf. Participant.retraite) : c'est lui
    # qui sépare les onglets « Participants IPM » et « Retraités ».
    retraite = serializers.BooleanField(read_only=True)

    typePiece = texte('type_piece')
    numeroPiece = texte('numero_piece')
    situationFamiliale = texte('situation_familiale')
    dateNaissance = DateOuVide(source='date_naissance')
    lieuNaissance = texte('lieu_naissance')
    dateEmbauche = DateOuVide(source='date_embauche')
    typeContrat = texte('type_contrat')
    numeroFiche = texte('numero_fiche')
    numeroContrat = texte('numero_contrat')
    dateSouscription = DateOuVide(source='date_souscription')
    etatContrat = texte('etat_contrat')
    dateResiliation = DateOuVide(source='date_resiliation')
    dateRadiation = DateOuVide(source='date_radiation')

    class Meta:
        model = Participant
        fields = [
            'id',
            # Champs dont le nom est identique des deux côtés.
            'matricule',
            'nom',
            'prenoms',
            'sexe',
            'photo',
            'nationalite',
            'adresse',
            'mobile',
            'region',
            'email',
            'categorie',
            'direction',
            'departement',
            'service',
            'adherent',
            'etat',
            'retraite',
            'actif',
            # Champs mappés (déclarés ci-dessus).
            'typePiece',
            'numeroPiece',
            'situationFamiliale',
            'dateNaissance',
            'lieuNaissance',
            'dateEmbauche',
            'typeContrat',
            'numeroFiche',
            'numeroContrat',
            'dateSouscription',
            'etatContrat',
            'dateResiliation',
            'dateRadiation',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    # Les champs que l'application d'origine marque d'un astérisque.
    CHAMPS_REQUIS = {
        'adherent': 'adherent',
        'nationalite': 'nationalite',
        'matricule': 'matricule',
        'sexe': 'sexe',
        'prenoms': 'prenoms',
        'nom': 'nom',
        'situation_familiale': 'situationFamiliale',
        'date_naissance': 'dateNaissance',
        'lieu_naissance': 'lieuNaissance',
        'adresse': 'adresse',
        'mobile': 'mobile',
        'email': 'email',
        'region': 'region',
        'date_embauche': 'dateEmbauche',
        'type_contrat': 'typeContrat',
    }

    def validate_matricule(self, valeur):
        # Comme l'application d'origine : quatre chiffres (« 0949 »), montrés
        # après le code de la société dans les documents (« 02-0949 »).
        if valeur and not re.fullmatch(r'\d{4}', valeur):
            raise serializers.ValidationError('Le matricule compte quatre chiffres (ex. 0949).')
        return valeur

    def valeur(self, attrs, champ):
        """Valeur envoyée, ou celle de la fiche en modification partielle."""
        return attrs[champ] if champ in attrs else getattr(self.instance, champ, None)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        self._controler_embauche(attrs)
        self._accorder_la_sortie(attrs)
        return attrs

    def update(self, instance, validated_data):
        # La famille porte la société et le matricule du participant dans son
        # propre matricule : si l'un des deux bouge, elle doit suivre, sinon
        # « 01-0949-21 » resterait sous une fiche passée en société 02.
        avant = (instance.adherent_id, instance.matricule)
        participant = super().update(instance, validated_data)
        if avant != (participant.adherent_id, participant.matricule):
            Beneficiaire.recomposer(participant)
        return participant

    def _controler_embauche(self, attrs):
        """On n'embauche pas quelqu'un avant ses seize ans."""
        naissance = self.valeur(attrs, 'date_naissance')
        embauche = self.valeur(attrs, 'date_embauche')
        if naissance and embauche and embauche.year - naissance.year < AGE_MINIMUM_EMBAUCHE:
            raise serializers.ValidationError(
                {
                    'dateEmbauche': [
                        'La date d’embauche précède les '
                        f'{AGE_MINIMUM_EMBAUCHE} ans du participant.'
                    ]
                }
            )

    def _accorder_la_sortie(self, attrs):
        """
        L'état du dossier et celui du contrat disent la même sortie.

        Un dossier résilié a son contrat fermé et sa date de résiliation ; un
        dossier radié, son contrat radié et sa date de radiation. Sans cela,
        le changement d'état en lot - qui n'envoie que l'état - laisserait des
        contrats « Ouverture » sous des participants radiés, et les deux
        colonnes se contrediraient à l'écran.

        Le retour en couverture (Actif, En Attente, Suspendu) efface les deux
        dates de sortie : elles n'auraient plus rien à dater.
        """
        etat = self.valeur(attrs, 'etat')
        if etat in SORTIES:
            contrat, champ_date = SORTIES[etat]
            attrs['etat_contrat'] = contrat
            if not self.valeur(attrs, champ_date):
                attrs[champ_date] = date.today()
            # L'autre date de sortie n'a plus lieu d'être.
            autre = next(d for _, d in SORTIES.values() if d != champ_date)
            attrs[autre] = None
        elif etat:
            attrs['etat_contrat'] = 'Ouverture'
            for _, champ_date in SORTIES.values():
                attrs[champ_date] = None


class BeneficiaireSerializer(serializers.ModelSerializer):
    # Composé par le serveur, jamais saisi : « 02-0949-21 » est la société,
    # le matricule du participant, le code du type et le rang dans ce type.
    # Modifiable, il aurait fini par désigner un autre participant que celui
    # de la fiche.
    matriculeBenef = serializers.CharField(source='matricule_benef', read_only=True)
    # Le type circule par son libellé (« EPOUSE »), celui que la liste montre ;
    # son code (« 2 ») suit en lecture, pour les documents.
    typeBenef = serializers.SlugRelatedField(
        source='type_benef',
        slug_field='libelle',
        queryset=TypeBeneficiaire.objects.all(),
        error_messages={'does_not_exist': 'Type de bénéficiaire inconnu.'},
    )
    codeTypeBenef = serializers.SerializerMethodField()
    # Le participant circule par son matricule ; son nom et sa société, que la
    # liste affiche, se lisent sur sa fiche - jamais recopiés.
    matriculePart = serializers.SlugRelatedField(
        source='participant',
        slug_field='matricule',
        queryset=Participant.objects.all(),
        error_messages={'does_not_exist': 'Aucun participant ne porte ce matricule.'},
    )
    participant = serializers.SerializerMethodField()
    codeSoc = serializers.SerializerMethodField()
    dateNaissance = DateOuVide(source='date_naissance')
    lieuNaissance = texte('lieu_naissance')

    class Meta:
        model = Beneficiaire
        fields = [
            'id',
            'matriculeBenef',
            'typeBenef',
            'codeTypeBenef',
            'prenoms',
            'nom',
            'matriculePart',
            'participant',
            'codeSoc',
            'adresse',
            'dateNaissance',
            'lieuNaissance',
            'sexe',
            'etat',
            'actif',
            'cree_le',
            'modifie_le',
        ]
        read_only_fields = ['id', 'cree_le', 'modifie_le']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        self._accorder_le_sexe(attrs)
        self._garder_le_participant(attrs)
        return attrs

    def _accorder_le_sexe(self, attrs):
        """Une épouse est une femme, un époux un homme."""
        type_benef = attrs.get('type_benef') or getattr(self.instance, 'type_benef', None)
        sexe = attrs['sexe'] if 'sexe' in attrs else getattr(self.instance, 'sexe', '')
        attendu = SEXE_DU_CONJOINT.get(type_benef.libelle if type_benef else '')
        if attendu and sexe and sexe != attendu:
            raise serializers.ValidationError(
                {'sexe': [f'Un bénéficiaire de type {type_benef.libelle} est '
                          f'{"une femme" if attendu == "F" else "un homme"}.']}
            )

    def _garder_le_participant(self, attrs):
        """
        Le porteur ne change pas de fiche.

        Le matricule du bénéficiaire porte celui du participant en son milieu
        et son rang dans la famille à la fin : le rattacher après coup à
        quelqu'un d'autre le laisserait désigner le premier.
        """
        nouveau = attrs.get('participant')
        if self.instance and nouveau and nouveau.pk != self.instance.participant_id:
            raise serializers.ValidationError(
                {'matriculePart': ['Un bénéficiaire ne change pas de participant.']}
            )

    def validate_typeBenef(self, type_benef):
        # Le participant n'est pas un membre de sa propre famille : il est
        # bénéficiaire de ses soins directement, dans les documents.
        if type_benef.libelle == TYPE_PARTICIPANT:
            raise serializers.ValidationError(
                'Un membre de la famille ne peut pas être du type PARTICIPANT.'
            )
        return type_benef

    def create(self, validated_data):
        validated_data['matricule_benef'] = Beneficiaire.prochain_matricule(
            validated_data['participant'], validated_data['type_benef']
        )
        return super().create(validated_data)

    def get_codeTypeBenef(self, beneficiaire):
        return beneficiaire.type_benef.code if beneficiaire.type_benef_id else ''

    def get_participant(self, beneficiaire):
        return beneficiaire.participant.nom_complet

    def get_codeSoc(self, beneficiaire):
        adherent = beneficiaire.participant.adherent
        return adherent.code if adherent else ''
