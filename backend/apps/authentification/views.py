"""
Vues d'authentification.

Trois points d'entrée et rien de plus : ouvrir une session, la fermer, et dire
qui elle désigne. Ce sont les trois chemins que ``src/services/api.js`` appelle.

``LoginView`` est la seule vue de l'API ouverte sans jeton — il faut bien un
moyen d'en obtenir un. Tout le reste exige ``IsAuthenticated``, fixé
globalement dans ``config/settings.py`` : aucune vue ne doit rouvrir l'accès
de son côté.
"""

from django.contrib.auth import authenticate, get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, UtilisateurSerializer

User = get_user_model()


class LoginView(APIView):
    """Échange un couple email / mot de passe contre un jeton."""

    # Seule exception au verrou global, et elle est nécessaire : sans elle,
    # aucun jeton ne pourrait jamais être obtenu. `authentication_classes`
    # vidé pour qu'un jeton périmé déjà présent ne fasse pas échouer l'appel.
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip()
        motdepasse = serializer.validated_data['password']

        # L'écran demande un email, Django authentifie sur le nom d'utilisateur :
        # on retrouve d'abord le compte par son adresse. `iexact` car une adresse
        # ne dépend pas de la casse ; `.first()` sur le plus ancien car rien
        # n'empêche techniquement deux comptes de partager une adresse.
        compte = User.objects.filter(email__iexact=email).order_by('pk').first()
        utilisateur = (
            authenticate(request, username=compte.get_username(), password=motdepasse)
            if compte
            else None
        )

        # Une seule et même réponse que le compte existe ou non : distinguer les
        # deux cas révélerait quelles adresses sont enregistrées. `authenticate`
        # écarte aussi les comptes désactivés.
        if utilisateur is None:
            return Response(
                {'detail': 'Email ou mot de passe incorrect.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        jeton, _ = Token.objects.get_or_create(user=utilisateur)
        return Response({'token': jeton.key, 'user': UtilisateurSerializer(utilisateur).data})


class LogoutView(APIView):
    """Ferme la session en détruisant le jeton côté serveur."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Détruit et ne se contente pas d'oublier : un jeton effacé du seul
        # navigateur resterait valable pour qui l'aurait recopié.
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MoiView(APIView):
    """Profil de la session en cours."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)
