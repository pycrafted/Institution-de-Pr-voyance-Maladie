"""
Dépôt des gabarits PDF officiels.

Les gabarits ne sont pas dans le dépôt : ils portent l'en-tête SAR et le
cachet du gérant. Sur le serveur de l'IPM on les pose dans
``apps/documents/modeles/``. Sur un hébergeur qui reconstruit le conteneur à
chaque déploiement, il n'y a pas de disque où les poser : cette vue permet de
les déposer en base, une fois, par le réseau (cf. ``models/modele_pdf.py``).

Réservée au personnel (``IsAdminUser``) : déposer un gabarit, c'est décider de
ce qui s'imprimera sous l'en-tête de la SAR.
"""

import hashlib

from django.core.cache import caches
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ModelePdf

# Les trois gabarits attendus par les modules d'impression. Fermer la liste
# évite de remplir la base de fichiers qui ne seront jamais lus.
NOMS_ATTENDUS = ('bon_pharmacie.pdf', 'bon_optique.pdf', 'lettre_garantie.pdf')

# Les gabarits officiels pèsent de 150 à 400 Ko ; 8 Mo laisse de la marge sans
# ouvrir la porte à n'importe quoi.
TAILLE_MAX = 8 * 1024 * 1024


def _resume(enregistrement):
    return {
        'nom': enregistrement.nom,
        'taille': enregistrement.taille,
        'empreinte': enregistrement.empreinte,
        'deposeLe': enregistrement.depose_le,
        'deposePar': getattr(enregistrement.depose_par, 'username', None),
    }


class ModelesPdfView(APIView):
    """Les gabarits déposés en base, et leur état."""

    permission_classes = [IsAdminUser]

    def get(self, requete):
        deposes = {m.nom: _resume(m) for m in ModelePdf.objects.only(
            'nom', 'taille', 'empreinte', 'depose_le', 'depose_par',
        )}
        return Response([deposes.get(nom, {'nom': nom, 'taille': None}) for nom in NOMS_ATTENDUS])


class ModelePdfView(APIView):
    """Dépôt (PUT) et retrait (DELETE) d'un gabarit, par son nom de fichier."""

    permission_classes = [IsAdminUser]

    def put(self, requete, nom):
        if nom not in NOMS_ATTENDUS:
            return Response(
                {'detail': f'Gabarit inconnu. Attendus : {", ".join(NOMS_ATTENDUS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fichier = requete.FILES.get('fichier')
        if fichier is None:
            return Response(
                {'detail': 'Envoyez le PDF dans le champ « fichier » (multipart/form-data).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if fichier.size > TAILLE_MAX:
            return Response(
                {'detail': f'Fichier trop lourd ({fichier.size} octets, maximum {TAILLE_MAX}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        octets = fichier.read()
        if not octets.startswith(b'%PDF-'):
            return Response(
                {'detail': "Ce n'est pas un PDF (en-tête « %PDF- » absent)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Empreinte annoncée par l'appelant : la transmission est vérifiée de
        # bout en bout plutôt que supposée.
        attendue = requete.data.get('empreinte')
        obtenue = hashlib.sha256(octets).hexdigest()
        if attendue and attendue != obtenue:
            return Response(
                {'detail': f'Empreinte reçue {obtenue}, attendue {attendue} : transfert incomplet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enregistrement = ModelePdf.deposer(nom, octets, par=requete.user)
        # Les PDF déjà fabriqués l'ont été avec l'ancien gabarit : ils ne
        # doivent plus être resservis.
        caches['pdf'].clear()
        return Response(_resume(enregistrement))

    def delete(self, requete, nom):
        supprimes, _ = ModelePdf.objects.filter(pk=nom).delete()
        if not supprimes:
            return Response(status=status.HTTP_404_NOT_FOUND)
        caches['pdf'].clear()
        return Response(status=status.HTTP_204_NO_CONTENT)
