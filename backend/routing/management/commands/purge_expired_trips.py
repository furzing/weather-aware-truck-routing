from django.core.management.base import BaseCommand
from django.utils import timezone

from routing.models import Trip


class Command(BaseCommand):
    help = "Delete expired comparisons and their routes/checkpoints in bounded batches."

    def handle(self, *args, **options):
        total = 0
        while ids := list(
            Trip.objects.filter(expires_at__lte=timezone.now()).values_list("id", flat=True)[:50]
        ):
            Trip.objects.filter(id__in=ids).delete()
            total += len(ids)
        if options["verbosity"]:
            self.stdout.write(f"Deleted {total} expired comparisons.")
