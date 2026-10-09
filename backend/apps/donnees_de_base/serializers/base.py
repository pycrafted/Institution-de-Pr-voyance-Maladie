"""Serializer de base partagé par les référentiels."""

from rest_framework import serializers


class ReferentielSerializer(serializers.ModelSerializer):
    """
    Expose les champs communs à tout référentiel. Les référentiels concrets
    héritent de ce serializer et complètent ``Meta.fields`` avec leurs champs
    propres.
    """

    class Meta:
        # Champs présents sur tous les référentiels. Le champ ``id`` est celui
        # sur lequel le frontend s'appuie pour modifier/désactiver une ligne.
        fields = ['id', 'code', 'libelle', 'actif', 'cree_le', 'modifie_le']
        read_only_fields = ['id', 'cree_le', 'modifie_le']
        # Aucun champ n'est exigé à la saisie, pas même le code : laissé vide à
        # la création, le serveur donne le suivant (cf. ReferentielViewSet).
        extra_kwargs = {'code': {'required': False, 'allow_blank': True}}

    def update(self, instance, validated_data):
        # Vidé en modification, le code garde sa valeur : d'autres fiches le
        # citent, une fiche en porte donc toujours un.
        if 'code' in validated_data and not validated_data['code']:
            del validated_data['code']
        return super().update(instance, validated_data)


class ReferentielAvecCompteSerializer(ReferentielSerializer):
    """Ajoute le compte comptable aux champs communs."""

    class Meta(ReferentielSerializer.Meta):
        fields = ReferentielSerializer.Meta.fields + ['compte']
