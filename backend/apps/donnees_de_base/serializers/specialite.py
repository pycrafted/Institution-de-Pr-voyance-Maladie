"""Serializer du référentiel Spécialité."""

from rest_framework import serializers

from ..models import Specialite
from ..natures_courantes import releve
from .base import ReferentielAvecCompteSerializer


class SpecialiteSerializer(ReferentielAvecCompteSerializer):
    """
    La spécialité porte, en lecture seule, les natures de prestation qu'elle
    couvre vraiment (``naturesCourantes``, de la plus fréquente à la moins
    fréquente), relevées sur les lettres réelles de LAMPS. L'écran « Lettre de
    Garantie » s'en sert pour ranger sa liste « Nature prestation » : un
    cardiologue n'a pas à chercher sa consultation parmi 63 lignes.

    Ce n'est pas une donnée saisie et personne ne la modifie ici : elle vient
    du relevé versionné (cf. donnees_de_base.natures_courantes).
    """

    naturesCourantes = serializers.SerializerMethodField()

    class Meta(ReferentielAvecCompteSerializer.Meta):
        model = Specialite
        fields = ReferentielAvecCompteSerializer.Meta.fields + ['naturesCourantes']

    def get_naturesCourantes(self, specialite):
        return releve().get(specialite.code, [])
