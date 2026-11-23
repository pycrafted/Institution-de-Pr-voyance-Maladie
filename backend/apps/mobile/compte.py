"""
Le compte mobile de l'employé : choisir son mot de passe, le changer.

Première connexion, ou mot de passe oublié : l'IPM génère un code
d'activation (six chiffres, sept jours, à usage unique) depuis le
back-office ou la commande ``codes_activation``, et le remet à l'employé.
Avec son matricule et ce code, l'employé choisit son mot de passe ; il est
aussitôt connecté.

Le mot de passe obéit aux mêmes règles que ceux des utilisateurs IPM
(huit caractères au moins, pas que des chiffres, pas un mot de passe
courant), et ne peut pas être le matricule.
"""

from django.contrib.auth import password_validation
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError as ErreurDjango
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from participants.models import Participant

from .authentification import emettre_jeton, peut_se_servir
from .serializers import representer_participant
from .views import (
    DOSSIER_INACTIF,
    IdentificationMatriculeThrottle,
    IdentificationThrottle,
    VueParticipant,
    _le_dossier_courant,
)

CODE_INCORRECT = 'Matricule ou code d’activation incorrect, ou code expiré.'
ANCIEN_INCORRECT = 'Mot de passe actuel incorrect.'


def dossiers_du_matricule(saisi):
    """
    Les dossiers que désigne un matricule tel que l'employé le tape
    (« 949 », « 0949 » ou « 01-0949 »), comme à l'identification.
    """
    societe, _, matricule = (saisi or '').strip().rpartition('-')
    if matricule.isdigit():
        matricule = matricule.zfill(4)
    candidats = Participant.objects.select_related('adherent').filter(matricule=matricule)
    if societe:
        candidats = candidats.filter(adherent__code=societe)
    return list(candidats)


def erreurs_mot_de_passe(mot_de_passe, participant):
    """Les règles du mot de passe : la liste des manquements (vide si bon)."""
    erreurs = []
    try:
        password_validation.validate_password(mot_de_passe)
    except ErreurDjango as e:
        erreurs.extend(e.messages)
    reste = mot_de_passe.strip().rpartition('-')[2]
    if reste.lstrip('0') and reste.lstrip('0') == participant.matricule.lstrip('0'):
        erreurs.append('Le mot de passe ne peut pas être votre matricule.')
    return erreurs


class ActivationSerializer(serializers.Serializer):
    matricule = serializers.CharField(max_length=30, trim_whitespace=True)
    code = serializers.CharField(max_length=12, trim_whitespace=True)
    mot_de_passe = serializers.CharField(max_length=128, trim_whitespace=False)


class ActivationView(APIView):
    """
    Matricule + code d'activation de l'IPM + nouveau mot de passe : le mot de
    passe est enregistré et l'employé reçoit son jeton, comme à
    l'identification. Mêmes freins contre les essais en rafale.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IdentificationThrottle, IdentificationMatriculeThrottle]

    def post(self, request):
        donnees = ActivationSerializer(data=request.data)
        if not donnees.is_valid():
            return Response({'detail': CODE_INCORRECT}, status=status.HTTP_400_BAD_REQUEST)
        code = donnees.validated_data['code'].replace(' ', '')
        mot_de_passe = donnees.validated_data['mot_de_passe']

        dossiers = dossiers_du_matricule(donnees.validated_data['matricule'])
        # Le code a pu être généré sur n'importe lequel des dossiers de
        # l'agent ; le mot de passe va sur celui qu'ouvre l'identification.
        valide = any(d.verifier_code_activation(code) for d in dossiers)
        if not valide:
            if not dossiers:
                make_password(code)  # même temps de réponse
            return Response({'detail': CODE_INCORRECT}, status=status.HTTP_400_BAD_REQUEST)

        participant = _le_dossier_courant(dossiers)
        erreurs = erreurs_mot_de_passe(mot_de_passe, participant)
        if erreurs:
            return Response(
                {'detail': erreurs[0], 'mot_de_passe': erreurs},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not peut_se_servir(participant):
            return Response({'detail': DOSSIER_INACTIF}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            participant.choisir_mot_de_passe(mot_de_passe)
            # Le code est brûlé sur tous les dossiers de l'agent.
            for autre in dossiers:
                if autre.pk != participant.pk and autre.code_activation:
                    autre.code_activation = ''
                    autre.code_activation_expire = None
                    autre.save(update_fields=['code_activation', 'code_activation_expire'])

        return Response(
            {'jeton': emettre_jeton(participant), 'participant': representer_participant(participant)}
        )


class ChangementSerializer(serializers.Serializer):
    ancien = serializers.CharField(max_length=128, trim_whitespace=False)
    nouveau = serializers.CharField(max_length=128, trim_whitespace=False)


class MotDePasseView(VueParticipant):
    """Changer son mot de passe, en donnant l'actuel."""

    throttle_classes = [IdentificationThrottle]

    def post(self, request):
        participant = request.auth
        donnees = ChangementSerializer(data=request.data)
        if not donnees.is_valid():
            return Response({'detail': ANCIEN_INCORRECT}, status=status.HTTP_400_BAD_REQUEST)
        if not participant.verifier_mot_de_passe(donnees.validated_data['ancien']):
            return Response({'detail': ANCIEN_INCORRECT}, status=status.HTTP_400_BAD_REQUEST)
        nouveau = donnees.validated_data['nouveau']
        erreurs = erreurs_mot_de_passe(nouveau, participant)
        if erreurs:
            return Response(
                {'detail': erreurs[0], 'mot_de_passe': erreurs},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participant.choisir_mot_de_passe(nouveau)
        return Response(status=status.HTTP_204_NO_CONTENT)
