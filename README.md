# Visualisation des trajets bureaux de vote

Application Vue.js + Leaflet pour visualiser les trajets des bureaux de vote groupés par proximité (5-6 bureaux par trajet).

## Installation & utilisation

1. Générer les clusters à partir des données:

```bash
npm run generate
```

2. Lancer le serveur de développement:

```bash
npm run serve
```

3. Ouvrir [http://localhost:8080/map.html](http://localhost:8080/map.html)

## Structure

- `bureaux_votes_2026.json` - Données des bureaux de vote
- `cluster_bureaux.js` - Script Node.js pour grouper les bureaux
- `map.html` - App Vue.js + Leaflet (interface interactive)
- `outputs/clusters_by_cp.json` - Résultat généré (groupes par CP)

## Fonctionnalités

- 🗺️ Carte interactive Leaflet
- 🎯 Affichage des trajets par code postal
- 📍 Marqueurs colorés et polylines pour chaque trajet
- 📋 Liste des bureaux dans la barre latérale
- 🔍 Zoom automatique sur le CP sélectionné
