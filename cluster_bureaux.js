const fs = require('fs').promises;
const path = require('path');

function haversine(a, b) {
  const R = 6371e3;
  const toRad = d => (d * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lon - a.lon);

  const sinDphi = Math.sin(dPhi / 2);
  const sinDlam = Math.sin(dLambda / 2);
  const x = sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlam * sinDlam;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

async function main() {
  const infile = path.join(__dirname, 'bureaux_votes_2026.json');
  const outdir = path.join(__dirname, 'outputs');
  const outfile = path.join(outdir, 'clusters_by_cp.json');

  await fs.mkdir(outdir, { recursive: true });
  const raw = await fs.readFile(infile, 'utf8');
  const all = JSON.parse(raw);

  const byCp = {};
  for (const item of all) {
    const cp = item.cp || item.code_postal || 'unknown';
    const lat = item.geo_point_2d && item.geo_point_2d.lat;
    const lon = item.geo_point_2d && item.geo_point_2d.lon;
    if (lat == null || lon == null) continue;

    const entry = {
      objectid: item.objectid,
      id_bv: item.id_bv,
      num_bv: item.num_bv,
      lib: item.lib,
      adresse: item.adresse,
      cp,
      lat,
      lon
    };

    byCp[cp] = byCp[cp] || [];
    byCp[cp].push(entry);
  }

  // Dedup adresse
  for (const cp in byCp) {
    const seen = new Set();
    byCp[cp] = byCp[cp].filter(item => {
      if (seen.has(item.adresse)) return false;
      seen.add(item.adresse);
      return true;
    });
  }

  const MIN = 2;
  const MAX = 6;
  const MAX_DISTANCE = 1000;

  function getMaxDistanceInCluster(cluster) {
    let maxDist = 0;
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const dist = haversine(cluster[i], cluster[j]);
        maxDist = Math.max(maxDist, dist);
      }
    }
    return maxDist;
  }

  function validateAndSplitClusters(clusters) {
    const result = [];
    const queue = clusters.slice();

    while (queue.length > 0) {
      const cluster = queue.shift();

      if (cluster.length < MIN) {
        result.push(cluster);
        continue;
      }

      const maxDist = getMaxDistanceInCluster(cluster);

      if (maxDist <= MAX_DISTANCE) {
        result.push(cluster);
      } else {
        let maxPair = null;
        let maxPairDist = 0;

        for (let i = 0; i < cluster.length; i++) {
          for (let j = i + 1; j < cluster.length; j++) {
            const dist = haversine(cluster[i], cluster[j]);
            if (dist > maxPairDist) {
              maxPairDist = dist;
              maxPair = [i, j];
            }
          }
        }

        if (maxPair) {
          const idxToMove = Math.max(...maxPair);
          const movedElem = cluster[idxToMove];
          const newCluster = cluster.filter((_, i) => i !== idxToMove);

          if (newCluster.length >= MIN) {
            queue.push(newCluster);
          } else {
            result.push(newCluster);
          }

          let added = false;
          for (const existing of result) {
            const test = [...existing, movedElem];
            if (getMaxDistanceInCluster(test) <= MAX_DISTANCE) {
              existing.push(movedElem);
              added = true;
              break;
            }
          }

          if (!added) {
            queue.push([movedElem]);
          }
        } else {
          result.push(cluster);
        }
      }
    }

    return result;
  }

  function mergeSmallClusters(clusters) {
    const big = [];
    const small = [];

    for (const c of clusters) {
      if (c.length >= MIN) big.push(c);
      else small.push(...c);
    }

    for (const point of small) {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < big.length; i++) {
        const test = [...big[i], point];
        const dist = getMaxDistanceInCluster(test);

        if (dist <= MAX_DISTANCE && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        big[bestIdx].push(point);
      } else {
        if (big.length > 0) {
          big[0].push(point);
        } else {
          big.push([point]);
        }
      }
    }

    return big;
  }

  const result = {};

  for (const [cp, items] of Object.entries(byCp)) {
    const remaining = items.slice();
    const clusters = [];

    while (remaining.length > 0) {
      const seed = remaining.shift();

      const neighbors = remaining
        .map(p => ({ p, d: haversine(seed, p) }))
        .filter(x => x.d <= MAX_DISTANCE)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX - 1)
        .map(x => x.p);

      const cluster = [seed, ...neighbors];

      // remove used points
      for (const n of neighbors) {
        const idx = remaining.indexOf(n);
        if (idx !== -1) remaining.splice(idx, 1);
      }

      clusters.push(cluster);
    }

    let validated = validateAndSplitClusters(clusters);
    validated = mergeSmallClusters(validated);

    result[cp] = validated;
  }

  await fs.writeFile(outfile, JSON.stringify(result, null, 2), 'utf8');
  console.log('Clusters written to', outfile);

  const summary = Object.entries(result).map(([cp, clusters]) => ({
    cp,
    groups: clusters.length,
    bureaux: clusters.reduce((s, c) => s + c.length, 0)
  }));

  console.log('Summary (first 10):', summary.slice(0, 10));

  const textOut = path.join(outdir, 'trajets_by_cp.txt');
  const lines = [];

  for (const [cp, clusters] of Object.entries(result)) {
    lines.push(cp);

    clusters.forEach((cluster, idx) => {
      if (cluster.length < 2) return;

      lines.push(`Trajet ${idx + 1}:`);
      const parts = cluster.map(item => `${item.adresse} (${item.lib})`);
      lines.push(parts.join(' -> '));
    });

    lines.push('');
  }

  await fs.writeFile(textOut, lines.join('\n'), 'utf8');
  console.log('Text trajets written to', textOut);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});