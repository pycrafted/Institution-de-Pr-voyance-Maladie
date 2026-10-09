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


class UtilisateurListeSerializer(serializers.ModelSerializer):
    """Vue liste d'un compte : identité, rôle et activité."""

    prenom = serializers.CharField(source='first_name')
    nom = serializers.CharField(source='last_name')
    actif = serializers.BooleanField(source='is_active')
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'prenom', 'nom', 'role', 'actif']

    def get_role(self, obj):
        if obj.is_superuser:
            return 'Admin'
        return 'Gestionnaire' if obj.is_staff else 'Utilisateur'


class UtilisateurEditionSerializer(serializers.ModelSerializer):
    """
    Création / modification d'un compte. Le rôle se choisit (Admin /
    Gestionnaire / Utilisateur) et pilote `is_superuser`/`is_staff`. L'email
    tient lieu d'identifiant de connexion (username), comme la page de login.
    Le mot de passe ne circule qu'en écriture ; vide en modification, il reste
    inchangé.
    """

    prenom = serializers.CharField(source='first_name', required=False, allow_blank=True)
    nom = serializers.CharField(source='last_name', required=False, allow_blank=True)
    actif = serializers.BooleanField(source='is_active', required=False)
    role = serializers.ChoiceField(
        choices=['Admin', 'Gestionnaire', 'Utilisateur'], required=False
    )
    motDePasse = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False
    )
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'prenom', 'nom', 'role', 'actif', 'motDePasse']

    def validate_email(self, valeur):
        valeur = valeur.strip()
        doublons = User.objects.filter(email__iexact=valeur)
        if self.instance:
            doublons = doublons.exclude(pk=self.instance.pk)
        if doublons.exists():
            raise serializers.ValidationError('Un utilisateur porte déjà cet email.')
        return valeur

    @staticmethod
    def _appliquer_role(user, role):
        user.is_superuser = role == 'Admin'
        user.is_staff = role in ('Admin', 'Gestionnaire')

    def create(self, donnees):
        role = donnees.pop('role', 'Utilisateur')
        motdepasse = donnees.pop('motDePasse', '')
        user = User(**donnees)
        user.username = donnees.get('email', '')
        self._appliquer_role(user, role)
        if motdepasse:
            user.set_password(motdepasse)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, donnees):
        role = donnees.pop('role', None)
        motdepasse = donnees.pop('motDePasse', None)
        for champ, valeur in donnees.items():
            setattr(instance, champ, valeur)
        if 'email' in donnees:
            instance.username = donnees['email']
        if role is not None:
            self._appliquer_role(instance, role)
        if motdepasse:
            instance.set_password(motdepasse)
        instance.save()
        return instance

    def to_representation(self, instance):
        return UtilisateurListeSerializer(instance).data
