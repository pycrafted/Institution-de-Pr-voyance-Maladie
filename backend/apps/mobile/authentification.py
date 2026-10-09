"""
Identification du participant sur l'application mobile.

Il n'y a pas encore de compte employé : le participant se fait reconnaître par
son matricule et sa date de naissance (cf. views.IdentificationView), et
reçoit en échange un jeton signé. Signé et non stocké : aucune table à tenir,
et le jour où les comptes arriveront, il suffira de remplacer cette étape.

Le jeton ne porte que l'identifiant du participant et sa date d'émission ;
la signature (clé secrète de Django) empêche de le forger ou d'y changer
l'identifiant. Il se présente dans l'en-tête ``Authorization: Participant
<jeton>`` - un mot-clé distinct du ``Token`` des utilisateurs IPM, pour que
jamais l'un ne soit pris pour l'autre.
"""

from datetime import timedelta

from django.contrib.auth.models import AnonymousUser
from django.core import signing
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from participants.models import Participant

# Sel propre à ce jeton : une valeur signée ailleurs avec la même clé
# secrète (session, réinitialisation de mot de passe…) n'est pas acceptée ici.
SEL = 'ipm.mobile.participant'

# Au-delà, le participant s'identifie à nouveau. Assez long pour ne pas
# lasser, assez court pour qu'un téléphone perdu ne reste pas ouvert à vie.
VALIDITE_JETON = timedelta(days=90)

MOT_CLE = 'Participant'

SESSION_EXPIREE = 'Session expirée. Identifiez-vous à nouveau.'


def _signataire():
    return signing.TimestampSigner(salt=SEL)


def emettre_jeton(participant):
    """Jeton signé désignant ce participant."""
    return _signataire().sign(str(participant.pk))


def peut_se_servir(participant):
    """
    Seul un dossier ouvert donne droit aux bons : participant actif, et
    dossier administrativement « Actif » (ni en attente, ni suspendu, ni
    résilié, ni radié).
    """
    return participant.actif and participant.etat == 'Actif'


def participant_du_jeton(jeton):
    """Le participant que désigne un jeton encore valable, sinon None."""
    try:
        identifiant = _signataire().unsign(jeton, max_age=VALIDITE_JETON)
    except signing.BadSignature:
        # SignatureExpired en est une sous-classe : jeton périmé, falsifié ou
        # illisible reçoivent la même réponse.
        return None
    participant = (
        Participant.objects.select_related('adherent').filter(pk=identifiant).first()
        if identifiant.isdigit()
        else None
    )
    # Un dossier fermé depuis l'émission du jeton ferme aussi la session.
    if participant is None or not peut_se_servir(participant):
        return None
    return participant


class ParticipantJetonAuthentication(BaseAuthentication):
    """
    Authentification des vues mobiles. Le participant est rendu dans
    ``request.auth`` ; ``request.user`` reste anonyme, car un participant
    n'est pas un utilisateur IPM et ne doit ouvrir aucune vue qui en exige un.
    """

    def authenticate(self, request):
        morceaux = get_authorization_header(request).split()
        if not morceaux or morceaux[0].lower() != MOT_CLE.lower().encode():
            # Pas de jeton participant : la permission répondra 401.
            return None
        if len(morceaux) != 2:
            raise AuthenticationFailed(SESSION_EXPIREE)
        try:
            jeton = morceaux[1].decode()
        except UnicodeError:
            raise AuthenticationFailed(SESSION_EXPIREE)
        participant = participant_du_jeton(jeton)
        if participant is None:
            raise AuthenticationFailed(SESSION_EXPIREE)
        return (AnonymousUser(), participant)

    def authenticate_header(self, request):
        # Sans en-tête WWW-Authenticate, DRF transformerait le 401 en 403 :
        # l'application ne saurait plus qu'il lui faut identifier à nouveau.
        return MOT_CLE


class EstParticipant(BasePermission):
    """Réservé à un participant identifié par son jeton."""

    def has_permission(self, request, view):
        return isinstance(request.auth, Participant)
