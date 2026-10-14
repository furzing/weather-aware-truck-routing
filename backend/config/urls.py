from django.urls import path
from routing import views

urlpatterns = [
    path("api/health", views.health),
    path("api/places", views.places),
    path("api/plan", views.plan),
    path("api/plans/<uuid:trip_id>", views.saved_plan),
    path("rules", views.index),
    path("rules/", views.index),
    path("", views.index),
]
