"""
Sérialiseurs du module Authentification.

Deux formes seulement : ce que la page de connexion envoie, et le profil que
l'application affiche en retour.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class LoginSerializer(serializers.Serializer):
    """Couple d'identifiants attendu par la page de connexion."""

    email = serializers.EmailField()
    # `trim_whitespace=False` : une espace en tête ou en fin fait partie du mot
    # de passe, la rogner ferait échouer une saisie pourtant juste.
    password = serializers.CharField(trim_whitespace=False, style={'input_type': 'password'})


class UtilisateurSerializer(serializers.ModelSerializer):
    """
    Profil renvoyé au frontend, tel que la barre supérieure l'attend
    (cf. src/components/header/AppHeaderActions.jsx) : le nom vient de
    ``first_name``/``last_name``, l'email sert de repli.

    ``role`` est dérivé et non stocké : l'application n'a pas encore de table
    de rôles, et un libellé calculé vaut mieux qu'une colonne vide.
    """

    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_superuser', 'role']
        read_only_fields = fields

    def get_role(self, obj):
        if obj.is_superuser:
            return 'Admin'
        return 'Gestionnaire' if obj.is_staff else 'Utilisateur'
