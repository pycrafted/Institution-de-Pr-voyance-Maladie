"""Vue du référentiel Article d'achat."""

from ..models import ArticleAchat
from ..serializers import ArticleAchatSerializer
from .base import ReferentielViewSet


class ArticleAchatViewSet(ReferentielViewSet):
    queryset = ArticleAchat.objects.all()
    serializer_class = ArticleAchatSerializer
