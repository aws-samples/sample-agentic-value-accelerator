"""evolve.py — evolutionary fixed-income portfolio construction (the demo's flagship quant).

A genetic algorithm searches over CONSTRUCTION RECIPES for the portfolio that best satisfies a
PM mandate against the real bond universe. This is the Meridian analog of quant-weather's
strategy leaderboard: each generation breeds better portfolios; we surface the fitness curve +
a leaderboard of the top constructions + the winning trade list.

Design notes:
- PURE STDLIB (math, random, statistics, json) — so the identical source runs three ways with
  zero deps: imported by the bond-tools Lambda (fallback), imported by the agent container
  (local fallback), and SHIPPED AS SOURCE into the AgentCore Code Interpreter sandbox (primary).
- `run(candidates, mandate, seed)` is the one entry point. It never throws on bad data — it
  filters, clamps, and returns a structured result.

Genome (what the GA evolves) = a CONSTRUCTION RECIPE:
    w_yield, w_oas, w_liquidity, w_convexity  — selection-score feature weights
    w_dur_gap, w_rating                        — selection-score penalties
    concentration                              — how peaked the weight allocation is
    n_bonds                                    — how many names to hold
The mandate fixes the hard constraints (duration target, rating floor, sector/issuer caps);
the GA explores recipes to best hit the objective within them.
"""
import json
import math
import random
import statistics

RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']
RATING_NUM = {r: i + 1 for i, r in enumerate(RATING_ORDER)}
AGG_DURATION = 6.0
AGG_YIELD = 4.6

# Genome gene bounds: (lo, hi). Structural genes (n_bonds) handled separately.
GENE_BOUNDS = {
    'w_yield': (0.0, 3.0), 'w_oas': (0.0, 2.5), 'w_liquidity': (0.0, 1.5),
    'w_convexity': (0.0, 1.5), 'w_dur_gap': (0.0, 3.0), 'w_rating': (0.0, 2.0),
    'concentration': (0.2, 2.5),
}


# ── helpers ──────────────────────────────────────────────────────────────────
def _zscores(values):
    if len(values) < 2:
        return [0.0] * len(values)
    mu = statistics.fmean(values)
    sd = statistics.pstdev(values) or 1.0
    return [(v - mu) / sd for v in values]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _rng_from(seed):
    return random.Random(seed)


# ── candidate prep ───────────────────────────────────────────────────────────
def _prepare(candidates, mandate):
    """Filter the candidate pool to the mandate's hard universe constraints and attach
    per-bond z-scores used by the selection score. Returns (pool, feature_cache)."""
    floor = mandate.get('rating_floor')
    floor_n = RATING_NUM.get(str(floor).upper()) if floor else None
    allow_hy = bool(mandate.get('allow_high_yield', False))
    exclude_treasury = bool(mandate.get('exclude_treasury', False))

    pool = []
    for b in candidates:
        if not isinstance(b, dict):
            continue
        rn = b.get('rating_num') or RATING_NUM.get(str(b.get('rating', '')).upper(), 99)
        if floor_n is not None and rn > floor_n:
            continue
        if not allow_hy and rn > RATING_NUM['BBB']:
            continue
        if exclude_treasury and b.get('is_treasury'):
            continue
        pool.append(b)
    if len(pool) < 5:  # mandate too tight — relax HY so we always have something to build
        pool = [b for b in candidates if isinstance(b, dict)]

    feat = {
        'z_ytm': _zscores([b.get('ytm', 0) for b in pool]),
        'z_oas': _zscores([b.get('oas', 0) for b in pool]),
        'z_liq': _zscores([b.get('liquidity', 0.5) for b in pool]),
        'z_cvx': _zscores([b.get('convexity', 0) for b in pool]),
    }
    return pool, feat


# ── construction from a genome ─────────────────────────────────────────────────
def _construct(genome, pool, feat, mandate):
    """Turn a recipe (genome) into a concrete weighted portfolio honoring sector/issuer caps."""
    target_dur = float(mandate.get('duration_target', AGG_DURATION))
    max_sector = float(mandate.get('max_sector_weight', 0.35))
    max_issuer = float(mandate.get('max_issuer_weight', 0.05))
    n_bonds = int(genome['n_bonds'])

    # Selection score per candidate.
    scored = []
    for i, b in enumerate(pool):
        rn = b.get('rating_num') or RATING_NUM.get(str(b.get('rating', '')).upper(), 4)
        score = (genome['w_yield'] * feat['z_ytm'][i]
                 + genome['w_oas'] * feat['z_oas'][i]
                 + genome['w_liquidity'] * feat['z_liq'][i]
                 + genome['w_convexity'] * feat['z_cvx'][i]
                 - genome['w_dur_gap'] * abs(b.get('mod_duration', 0) - target_dur)
                 - genome['w_rating'] * rn)
        scored.append((score, b))
    scored.sort(key=lambda x: x[0], reverse=True)

    # Greedy pick respecting issuer count cap (proxy: at most ceil(max_issuer*n_bonds)+1 names
    # per issuer) and leaving sector capacity; weights assigned next.
    picks = []
    issuer_count = {}
    per_issuer_cap = max(1, int(math.ceil(max_issuer * n_bonds)) + 1)
    for score, b in scored:
        iss = b.get('issuer', b.get('ticker', '?'))
        if issuer_count.get(iss, 0) >= per_issuer_cap:
            continue
        picks.append((score, b))
        issuer_count[iss] = issuer_count.get(iss, 0) + 1
        if len(picks) >= n_bonds:
            break
    if not picks:
        return None

    # Weight ∝ softmax(score * concentration); then enforce per-issuer & per-sector caps by
    # clipping + renormalizing (a couple of passes converge well enough for the demo).
    conc = genome['concentration']
    smax = max(s for s, _ in picks)
    raw = [math.exp(_clamp((s - smax) * conc, -50, 0)) for s, _ in picks]
    tot = sum(raw) or 1.0
    weights = [r / tot for r in raw]

    for _ in range(3):
        # issuer cap
        iss_w = {}
        for (_, b), w in zip(picks, weights):
            iss = b.get('issuer', b.get('ticker', '?'))
            iss_w[iss] = iss_w.get(iss, 0) + w
        weights = [min(w, max_issuer) if iss_w.get(picks[i][1].get('issuer', picks[i][1].get('ticker', '?')), 0) > max_issuer else w
                   for i, w in enumerate(weights)]
        # sector cap
        sec_w = {}
        for (_, b), w in zip(picks, weights):
            sec_w[b.get('sector', '?')] = sec_w.get(b.get('sector', '?'), 0) + w
        scaled = []
        for (_, b), w in zip(picks, weights):
            sw = sec_w.get(b.get('sector', '?'), 0)
            scaled.append(w * (max_sector / sw) if sw > max_sector else w)
        weights = scaled
        s = sum(weights) or 1.0
        weights = [w / s for w in weights]

    holdings = [{'cusip': b.get('cusip'), 'ticker': b.get('ticker'), 'issuer': b.get('issuer'),
                 'sector': b.get('sector'), 'rating': b.get('rating'),
                 'rating_num': b.get('rating_num') or RATING_NUM.get(str(b.get('rating', '')).upper(), 4),
                 'ytm': b.get('ytm', 0), 'mod_duration': b.get('mod_duration', 0),
                 'convexity': b.get('convexity', 0), 'oas': b.get('oas', 0),
                 'years': b.get('years', 0), 'weight': round(w, 5)}
                for (_, b), w in zip(picks, weights) if w > 1e-4]
    return holdings


# ── metrics + fitness ──────────────────────────────────────────────────────────
def _metrics(holdings, mandate):
    target_dur = float(mandate.get('duration_target', AGG_DURATION))
    dur = sum(h['weight'] * h['mod_duration'] for h in holdings)
    cvx = sum(h['weight'] * h['convexity'] for h in holdings)
    ytm = sum(h['weight'] * h['ytm'] for h in holdings)
    oas = sum(h['weight'] * h['oas'] for h in holdings)
    # Diversification: 1 - Herfindahl (1 = perfectly diversified).
    herf = sum(h['weight'] ** 2 for h in holdings)
    diversification = 1 - herf
    # Tracking-error proxy vs the Agg: duration gap (rate risk) + spread-duration gap (credit).
    te = math.sqrt((dur - AGG_DURATION) ** 2 * 0.0001 + (oas * dur * 0.01) ** 2) * 100
    # +200bps parallel stress P&L (%).
    stress_200 = (-dur * 0.02 + 0.5 * cvx * 0.02 ** 2) * 100
    sector_mix, rating_mix = {}, {}
    for h in holdings:
        sector_mix[h['sector']] = round(sector_mix.get(h['sector'], 0) + h['weight'] * 100, 2)
        rating_mix[h['rating']] = round(rating_mix.get(h['rating'], 0) + h['weight'] * 100, 2)
    return {
        'n_bonds': len(holdings),
        'yield': round(ytm, 3), 'duration': round(dur, 3), 'convexity': round(cvx, 2),
        'oas': round(oas, 4), 'duration_gap': round(dur - target_dur, 3),
        'yield_pickup_vs_agg': round(ytm - AGG_YIELD, 3),
        'tracking_error': round(te, 3), 'stress_200bps': round(stress_200, 3),
        'diversification': round(diversification, 4),
        'sector_mix': sector_mix, 'rating_mix': rating_mix,
    }


def _fitness(m, mandate):
    """Higher is better. Real, defensible objective: reward yield pickup + diversification +
    convexity-cushioned stress; penalize duration miss + tracking error."""
    target_dur = float(mandate.get('duration_target', AGG_DURATION))
    yield_w = float(mandate.get('yield_weight', 1.0))
    risk_w = float(mandate.get('risk_weight', 1.0))
    return round(
        yield_w * m['yield_pickup_vs_agg']
        - risk_w * 1.20 * abs(m['duration'] - target_dur)
        - risk_w * 0.40 * m['tracking_error']
        + risk_w * 0.15 * (m['stress_200bps'] + 12)   # less negative stress → higher
        + 0.80 * m['diversification'],
        4)


# ── GA ──────────────────────────────────────────────────────────────────────--
def _random_genome(rng, n_lo, n_hi):
    g = {k: round(rng.uniform(lo, hi), 3) for k, (lo, hi) in GENE_BOUNDS.items()}
    g['n_bonds'] = rng.randint(n_lo, n_hi)
    return g


def _crossover(a, b, rng):
    child = {}
    for k in GENE_BOUNDS:
        child[k] = a[k] if rng.random() < 0.5 else b[k]
    child['n_bonds'] = a['n_bonds'] if rng.random() < 0.5 else b['n_bonds']
    return child


def _mutate(g, rng, n_lo, n_hi, rate=0.3):
    out = dict(g)
    for k, (lo, hi) in GENE_BOUNDS.items():
        if rng.random() < rate:
            out[k] = round(_clamp(g[k] + rng.gauss(0, (hi - lo) * 0.15), lo, hi), 3)
    if rng.random() < rate:
        out['n_bonds'] = _clamp(g['n_bonds'] + rng.choice([-5, -3, 3, 5]), n_lo, n_hi)
    return out


def run(candidates, mandate, seed=20260101, generations=6, population=24):
    """Evolve construction recipes. Returns the fitness curve + leaderboard + winner.

    candidates: list of bond dicts (from the screen). mandate: the PM constraints/objective.
    """
    mandate = dict(mandate or {})
    rng = _rng_from(seed)
    pool, feat = _prepare(candidates, mandate)
    if len(pool) < 5:
        return {'error': 'not enough candidate bonds to construct a portfolio',
                'candidates': len(candidates)}

    n_target = int(mandate.get('n_bonds', 25))
    n_lo, n_hi = max(8, n_target - 10), min(len(pool), max(n_target + 10, 20))

    def evaluate(genome):
        holdings = _construct(genome, pool, feat, mandate)
        if not holdings:
            return None
        m = _metrics(holdings, mandate)
        return {'genome': genome, 'metrics': m, 'fitness': _fitness(m, mandate),
                'holdings': holdings}

    pop = [_random_genome(rng, n_lo, n_hi) for _ in range(population)]
    curve = []
    seen = {}      # signature -> best evaluated portfolio (dedup leaderboard)

    for gen in range(generations):
        evaluated = [e for e in (evaluate(g) for g in pop) if e]
        evaluated.sort(key=lambda e: e['fitness'], reverse=True)
        for e in evaluated:
            sig = (e['metrics']['n_bonds'], round(e['metrics']['yield'], 2),
                   round(e['metrics']['duration'], 2))
            if sig not in seen or e['fitness'] > seen[sig]['fitness']:
                seen[sig] = e
        best = evaluated[0]['fitness'] if evaluated else 0
        avg = round(statistics.fmean([e['fitness'] for e in evaluated]), 4) if evaluated else 0
        curve.append({'generation': gen + 1, 'best_fitness': round(best, 4),
                      'avg_fitness': avg, 'evaluated': len(evaluated)})

        # Next generation: elitism (top 4) + tournament-selected, crossed-over, mutated.
        elite = [e['genome'] for e in evaluated[:4]]
        nxt = list(elite)
        while len(nxt) < population:
            a = max(rng.sample(evaluated, min(3, len(evaluated))), key=lambda e: e['fitness'])['genome']
            b = max(rng.sample(evaluated, min(3, len(evaluated))), key=lambda e: e['fitness'])['genome']
            nxt.append(_mutate(_crossover(a, b, rng), rng, n_lo, n_hi))
        pop = nxt

    ranked = sorted(seen.values(), key=lambda e: e['fitness'], reverse=True)
    leaderboard = []
    for rank, e in enumerate(ranked[:12], 1):
        leaderboard.append({'rank': rank, 'fitness': round(e['fitness'], 4),
                            'recipe': {k: e['genome'][k] for k in ('n_bonds', 'w_yield', 'w_oas',
                                                                    'w_dur_gap', 'concentration')},
                            **e['metrics']})
    winner = ranked[0]
    return {
        'mandate': mandate,
        'universe_candidates': len(candidates),
        'eligible_pool': len(pool),
        'generations': curve,
        'leaderboard': leaderboard,
        'winner': {'fitness': round(winner['fitness'], 4), 'metrics': winner['metrics'],
                   'recipe': winner['genome'], 'holdings': winner['holdings']},
        'evaluated_total': generations * population,
    }


# When shipped into Code Interpreter, the agent appends:  CANDIDATES, MANDATE, SEED, then:
#   print(json.dumps(run(CANDIDATES, MANDATE, SEED)))
if __name__ == '__main__':
    import sys
    data = json.load(sys.stdin)
    print(json.dumps(run(data['candidates'], data.get('mandate', {}), data.get('seed', 20260101))))
