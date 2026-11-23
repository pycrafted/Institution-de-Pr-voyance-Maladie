"""
Connexion par empreinte digitale ou Face ID : les clés d'accès (« passkeys »,
norme WebAuthn), vérifiées par la bibliothèque py_webauthn.

Deux temps, chaque fois :
  1. l'application demande des OPTIONS (un défi aléatoire, à signer) ;
  2. le téléphone fait poser le doigt ou regarder l'écran, signe le défi avec
     la clé privée qu'il garde, et l'application renvoie cette RÉPONSE, que le
     serveur vérifie avec la clé publique enregistrée.

Le défi ne se garde pas en base : il voyage dans un jeton signé (clé secrète
de Django, cinq minutes), que l'application renvoie avec la réponse. Un
défi déjà servi est retenu en cache le temps de sa validité : il ne sert
qu'une fois.

Inscription (connecté, mot de passe déjà vérifié) : une clé par appareil,
liée au compte. Connexion : sans rien taper - le téléphone propose les clés
qu'il connaît pour l'application (clés « découvrables »).

Le domaine de la clé est celui de l'application (ipm-mobile.vercel.app, ou
localhost en développement) : il se lit dans l'en-tête Origin, qui doit
figurer dans WEBAUTHN_ORIGINES (réglages).
"""

import json
from urllib.parse import urlsplit

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from participants.models import CleAcces

from .authentification import emettre_jeton, peut_se_servir
from .serializers import matricule_affiche, representer_participant
from .views import DOSSIER_INACTIF, IdentificationThrottle, VueParticipant

SEL = 'ipm.mobile.webauthn'
VALIDITE_DEFI = 300  # secondes
NOM_SERVICE = 'IPM-SAR'

CLE_INCONNUE = 'Cette empreinte n’est plus reconnue. Connectez-vous avec votre mot de passe.'
ECHEC = 'La vérification a échoué. Réessayez, ou connectez-vous avec votre mot de passe.'
ORIGINE_REFUSEE = 'Connexion par empreinte indisponible depuis cette adresse.'


def _origine(request):
    """L'origine de l'application (« https://ipm-mobile.vercel.app ») si elle est permise."""
    origine = (request.headers.get('Origin') or '').rstrip('/')
    return origine if origine in settings.WEBAUTHN_ORIGINES else None


def _domaine(origine):
    return urlsplit(origine).hostname


def _emballer(defi, origine, participant_id=None):
    return signing.dumps(
        {'d': bytes_to_base64url(defi), 'o': origine, 'p': participant_id}, salt=SEL
    )


def _deballer(jeton, origine, participant_id=None):
    """Le défi du jeton, s'il est intact, récent, de cette origine, et pas déjà servi."""
    try:
        contenu = signing.loads(jeton or '', salt=SEL, max_age=VALIDITE_DEFI)
    except signing.BadSignature:
        return None
    if contenu.get('o') != origine or contenu.get('p') != participant_id:
        return None
    # Usage unique : add() échoue si le défi a déjà été présenté.
    if not cache.add(f'{SEL}:{contenu["d"]}', True, VALIDITE_DEFI):
        return None
    return base64url_to_bytes(contenu['d'])


def _nom_appareil(request):
    agent = request.headers.get('User-Agent', '')
    for motif, nom in (
        ('iPhone', 'iPhone'),
        ('iPad', 'iPad'),
        ('Android', 'Android'),
        ('Macintosh', 'Mac'),
        ('Windows', 'Windows'),
    ):
        if motif in agent:
            return nom
    return 'Appareil'


def _representer(cle):
    return {
        'id': cle.pk,
        'nom': cle.nom,
        'creeLe': cle.cree_le.isoformat(),
        'utiliseeLe': cle.utilisee_le.isoformat() if cle.utilisee_le else None,
    }


class InscriptionOptionsView(VueParticipant):
    """Les options pour créer une clé sur cet appareil (employé connecté)."""

    def post(self, request):
        origine = _origine(request)
        if not origine:
            return Response({'detail': ORIGINE_REFUSEE}, status=status.HTTP_400_BAD_REQUEST)
        participant = request.auth
        options = generate_registration_options(
            rp_id=_domaine(origine),
            rp_name=NOM_SERVICE,
            # L'identifiant du compte dans la clé : le numéro interne, rien de
            # personnel (il reste lisible par l'appareil).
            user_id=str(participant.pk).encode(),
            user_name=matricule_affiche(participant),
            user_display_name=participant.nom_complet or matricule_affiche(participant),
            # Sur CET appareil (empreinte, Face ID), découvrable (connexion sans
            # rien taper), et toujours avec vérification de l'utilisateur.
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment=AuthenticatorAttachment.PLATFORM,
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
            # Une clé déjà enregistrée sur cet appareil n'est pas recréée.
            exclude_credentials=[
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.identifiant))
                for c in participant.cles_acces.all()
            ],
        )
        return Response(
            {
                'options': json.loads(options_to_json(options)),
                'jeton': _emballer(options.challenge, origine, participant.pk),
            }
        )


class InscriptionView(VueParticipant):
    """Enregistre la clé que l'appareil vient de créer."""

    def post(self, request):
        origine = _origine(request)
        if not origine:
            return Response({'detail': ORIGINE_REFUSEE}, status=status.HTTP_400_BAD_REQUEST)
        participant = request.auth
        defi = _deballer(request.data.get('jeton'), origine, participant.pk)
        if defi is None:
            return Response({'detail': ECHEC}, status=status.HTTP_400_BAD_REQUEST)
        try:
            verifiee = verify_registration_response(
                credential=request.data.get('reponse'),
                expected_challenge=defi,
                expected_origin=origine,
                expected_rp_id=_domaine(origine),
                require_user_verification=True,
            )
        except Exception:  # noqa: BLE001 - toute réponse invalide est un échec
            return Response({'detail': ECHEC}, status=status.HTTP_400_BAD_REQUEST)
        reponse = request.data.get('reponse') or {}
        transports = (reponse.get('response') or {}).get('transports') or []
        cle, _ = CleAcces.objects.update_or_create(
            identifiant=bytes_to_base64url(verifiee.credential_id),
            defaults={
                'participant': participant,
                'cle_publique': verifiee.credential_public_key,
                'compteur': verifiee.sign_count,
                'transports': [t for t in transports if isinstance(t, str)][:6],
                'nom': _nom_appareil(request),
            },
        )
        return Response(_representer(cle), status=status.HTTP_201_CREATED)


class ConnexionOptionsView(APIView):
    """Les options pour se connecter avec une clé (sans rien taper)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IdentificationThrottle]

    def post(self, request):
        origine = _origine(request)
        if not origine:
            return Response({'detail': ORIGINE_REFUSEE}, status=status.HTTP_400_BAD_REQUEST)
        options = generate_authentication_options(
            rp_id=_domaine(origine),
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        return Response(
            {
                'options': json.loads(options_to_json(options)),
                'jeton': _emballer(options.challenge, origine),
            }
        )


class ConnexionView(APIView):
    """Vérifie la signature de l'appareil et rend un jeton participant."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IdentificationThrottle]

    def post(self, request):
        origine = _origine(request)
        if not origine:
            return Response({'detail': ORIGINE_REFUSEE}, status=status.HTTP_400_BAD_REQUEST)
        reponse = request.data.get('reponse') or {}
        cle = (
            CleAcces.objects.select_related('participant__adherent')
            .filter(identifiant=reponse.get('id') or '')
            .first()
        )
        if cle is None:
            return Response({'detail': CLE_INCONNUE}, status=status.HTTP_401_UNAUTHORIZED)
        defi = _deballer(request.data.get('jeton'), origine)
        if defi is None:
            return Response({'detail': ECHEC}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            verifiee = verify_authentication_response(
                credential=reponse,
                expected_challenge=defi,
                expected_rp_id=_domaine(origine),
                expected_origin=origine,
                credential_public_key=bytes(cle.cle_publique),
                credential_current_sign_count=cle.compteur,
                require_user_verification=True,
            )
        except Exception:  # noqa: BLE001 - signature fausse, compteur qui recule…
            return Response({'detail': ECHEC}, status=status.HTTP_401_UNAUTHORIZED)

        participant = cle.participant
        if not peut_se_servir(participant):
            return Response({'detail': DOSSIER_INACTIF}, status=status.HTTP_403_FORBIDDEN)
        cle.compteur = verifiee.new_sign_count
        cle.utilisee_le = timezone.now()
        cle.save(update_fields=['compteur', 'utilisee_le'])
        return Response(
            {'jeton': emettre_jeton(participant), 'participant': representer_participant(participant)}
        )


class ClesView(VueParticipant):
    """Les clés de l'employé (son profil), pour les voir et les retirer."""

    def get(self, request):
        return Response([_representer(c) for c in request.auth.cles_acces.all()])


class CleView(VueParticipant):
    def delete(self, request, pk):
        supprimees, _ = request.auth.cles_acces.filter(pk=pk).delete()
        if not supprimees:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
