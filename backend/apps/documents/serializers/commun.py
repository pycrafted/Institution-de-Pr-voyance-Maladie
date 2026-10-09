"""
Ce que les documents de prise en charge - bon de pharmacie, lettre de
garantie - ont en commun.

Chacun désigne une société, un de ses participants et un bénéficiaire (un
ayant droit, ou le participant lui-même), ainsi que des fournisseurs de soins
choisis dans une spécialité. Chaque tiers circule par son code - société
« 02 », participant « 0949 », type « 2 », bénéficiaire « 02-0949-21 » - et
son nom revient en lecture, lu sur sa fiche. Les contrôles de cohérence sont
les mêmes d'un document à l'autre : ils vivent ici.
"""

from rest_framework import serializers

from participants.models import Beneficiaire
from participants.serializers.participant import TYPE_PARTICIPANT, ChampsRequisMixin


def lien(source, modele, slug, message, **kwargs):
    """
    Tiers désigné par son code ; un code inconnu est refusé en clair.
    ``source`` à None quand le champ porte déjà le nom de la colonne (DRF
    refuse une source identique au nom du champ).
    """
    if source is not None:
        kwargs['source'] = source
    return serializers.SlugRelatedField(
        slug_field=slug,
        queryset=modele.objects.all(),
        required=False,
        allow_null=True,
        error_messages={'does_not_exist': message},
        **kwargs,
    )


class DocumentBeneficiaireMixin(ChampsRequisMixin):
    """
    Contrôles communs : le participant appartient à la société, le
    bénéficiaire au participant et au type, chaque fournisseur à sa
    spécialité. Le bénéficiaire circule par son matricule
    (``matriculeBenef``, écriture seule) - ou celui du participant pour le
    type PARTICIPANT - et se résout ici.
    """

    # Les champs que l'application d'origine marque d'un astérisque - le
    # bénéficiaire, lui, est contrôlé avec sa résolution (cf. `validate`).
    CHAMPS_REQUIS = {
        'adherent': 'codeSoc',
        'participant': 'matriculePart',
        'type_benef': 'typeBenef',
    }

    # Couples (spécialité, fournisseur) du modèle, avec le champ de l'écran
    # sous lequel l'erreur se pose et son message.
    COUPLES_SPECIALITE = [
        ('specialite', 'prescripteur', 'prescripteur',
         'Ce prescripteur n’est pas de la spécialité choisie.'),
    ]

    def _valeur(self, attrs, champ):
        return attrs[champ] if champ in attrs else getattr(self.instance, champ, None)

    def validate(self, attrs):
        saisi = attrs.pop('matriculeBenef', None)
        attrs = super().validate(attrs)
        adherent = self._valeur(attrs, 'adherent')
        participant = self._valeur(attrs, 'participant')
        type_benef = self._valeur(attrs, 'type_benef')
        erreurs = {}

        if 'participant' in attrs or 'adherent' in attrs:
            if participant.adherent_id != adherent.id:
                erreurs['matriculePart'] = ['Ce participant n’appartient pas à la société choisie.']

        # Le bénéficiaire ne se résout que si ce qui le désigne a été envoyé :
        # un changement d'état en lot ne le remet pas en cause.
        if saisi is not None or 'participant' in attrs or 'type_benef' in attrs:
            if type_benef.libelle == TYPE_PARTICIPANT:
                # Le participant est bénéficiaire de ses propres soins.
                attrs['beneficiaire'] = None
            else:
                matricule = saisi if saisi is not None else (
                    self.instance.beneficiaire.matricule_benef
                    if self.instance and self.instance.beneficiaire_id
                    else ''
                )
                beneficiaire = Beneficiaire.objects.filter(matricule_benef=matricule).first()
                if not matricule:
                    erreurs['matriculeBenef'] = ['Champ obligatoire.']
                elif beneficiaire is None:
                    erreurs['matriculeBenef'] = ['Aucun bénéficiaire ne porte ce matricule.']
                elif beneficiaire.participant_id != participant.id:
                    erreurs['matriculeBenef'] = ['Ce bénéficiaire n’est pas rattaché au participant choisi.']
                elif beneficiaire.type_benef_id != type_benef.id:
                    erreurs['matriculeBenef'] = ['Ce bénéficiaire n’est pas du type choisi.']
                else:
                    attrs['beneficiaire'] = beneficiaire

        for champ_specialite, champ_fournisseur, nom, message in self.COUPLES_SPECIALITE:
            specialite = self._valeur(attrs, champ_specialite)
            fournisseur = self._valeur(attrs, champ_fournisseur)
            if fournisseur and specialite and fournisseur.specialite_id != specialite.id:
                erreurs[nom] = [message]

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return attrs

    def to_representation(self, document):
        donnees = super().to_representation(document)
        if document.beneficiaire_id:
            donnees['matriculeBenef'] = document.beneficiaire.matricule_benef
        else:
            donnees['matriculeBenef'] = document.participant.matricule if document.participant_id else ''
        return donnees

    def get_participant(self, document):
        return document.participant.nom_complet if document.participant_id else ''

    def get_beneficiaire(self, document):
        if document.beneficiaire_id:
            return document.beneficiaire.nom_complet
        return document.participant.nom_complet if document.participant_id else ''
