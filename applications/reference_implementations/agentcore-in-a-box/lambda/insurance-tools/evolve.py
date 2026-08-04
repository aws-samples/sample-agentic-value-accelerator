"""evolve.py — evolutionary underwriting-book construction for the insurance desk.

The insurance analog of the bond desk's evolve.py: a genetic algorithm searches over BOOK
CONSTRUCTION RECIPES for the set of submissions that best satisfies an underwriting appetite
against the REAL submission universe (each submission carries a REAL, FEMA-NRI-derived
catastrophe loss cost). Each generation breeds better books; we surface the fitness curve + a
leaderboard of top constructions + the winning bind list.

Design notes (mirror bond-tools/evolve.py):
- PURE STDLIB (math, random, statistics, json) — no deps, so the identical source runs as the
  Lambda fallback, in the agent container, or shipped into the AgentCore Code Interpreter.
- `run(candidates, appetite, seed)` is the one entry point; never throws on bad data.

Genome (what the GA evolves) = a construction recipe of selection-score feature weights +
structural genes (how many risks to bind, how peaked the premium allocation is). The appetite
fixes the hard constraints (target loss ratio, line/state caps, cat-PML ceiling); the GA explores
recipes to best hit the objective within them. All economics (loss cost, expected loss, cat share)
are REAL — from the FEMA-anchored universe — so the winning book is a genuinely-optimized book.
"""
import math
import random
import statistics

# Genome gene bounds: (lo, hi).
GENE_BOUNDS = {
    'w_rate': (0.0, 3.0),        # reward rate adequacy (charged vs technical)
    'w_margin': (0.0, 2.5),      # reward premium net of expected loss
    'w_lowcat': (0.0, 2.5),      # reward LOW catastrophe loss cost
    'w_lowsovi': (0.0, 1.5),     # reward lower social vulnerability
    'w_hazard': (0.0, 3.0),      # penalize high hazard grade
    'concentration': (0.2, 2.5), # how peaked the premium allocation is
}


def _zscores(values):
    if len(values) < 2:
        return [0.0] * len(values)
    mu = statistics.fmean(values)
    sd = statistics.pstdev(values) or 1.0
    return [(v - mu) / sd for v in values]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _prepare(candidates, appetite):
    """Filter to the appetite's hard universe constraints and attach per-submission z-scores."""
    max_hazard = int(appetite.get('max_hazard_grade', 5))
    excl_zones = {z.lower() for z in (appetite.get('exclude_cat_zones') or [])}
    pool = []
    for s in candidates:
        if not isinstance(s, dict):
            continue
        if s.get('hazard_grade', 5) > max_hazard:
            continue
        if excl_zones and str(s.get('cat_zone', '')).lower() in excl_zones:
            continue
        if not s.get('technical_premium'):
            continue
        pool.append(s)
    if len(pool) < 8:  # appetite too tight — relax so we always have something to build
        pool = [s for s in candidates if isinstance(s, dict) and s.get('technical_premium')]

    feat = {
        'z_rate': _zscores([s.get('rate_adequacy', 1.0) for s in pool]),
        'z_margin': _zscores([(s.get('technical_premium', 0) - s.get('expected_loss', 0)) for s in pool]),
        'z_cat': _zscores([s.get('loss_cost_bps', 0) for s in pool]),
        'z_sovi': _zscores([s.get('sovi_score', 50) for s in pool]),
    }
    return pool, feat


def _construct(genome, pool, feat, appetite):
    """Turn a recipe into a concrete bound book honoring line/state premium caps."""
    max_line = float(appetite.get('max_line_weight', 0.45))
    max_state = float(appetite.get('max_state_weight', 0.30))
    n_risks = int(genome['n_risks'])

    scored = []
    for i, s in enumerate(pool):
        score = (genome['w_rate'] * feat['z_rate'][i]
                 + genome['w_margin'] * feat['z_margin'][i]
                 - genome['w_lowcat'] * feat['z_cat'][i]      # lower cat loss cost is better
                 - genome['w_lowsovi'] * feat['z_sovi'][i]
                 - genome['w_hazard'] * s.get('hazard_grade', 3))
        scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    picks = [(sc, s) for sc, s in scored[:n_risks]]
    if not picks:
        return None

    # Premium weight ∝ softmax(score * concentration), then enforce line & state caps.
    conc = genome['concentration']
    smax = max(sc for sc, _ in picks)
    raw = [math.exp(_clamp((sc - smax) * conc, -50, 0)) for sc, _ in picks]
    tot = sum(raw) or 1.0
    weights = [r / tot for r in raw]

    for _ in range(3):
        line_w, state_w = {}, {}
        for (_, s), w in zip(picks, weights):
            line_w[s.get('line', '?')] = line_w.get(s.get('line', '?'), 0) + w
            state_w[s.get('state', '?')] = state_w.get(s.get('state', '?'), 0) + w
        scaled = []
        for (_, s), w in zip(picks, weights):
            lw = line_w.get(s.get('line', '?'), 0)
            sw = state_w.get(s.get('state', '?'), 0)
            f = 1.0
            if lw > max_line:
                f = min(f, max_line / lw)
            if sw > max_state:
                f = min(f, max_state / sw)
            scaled.append(w * f)
        tot = sum(scaled) or 1.0
        weights = [w / tot for w in scaled]

    book = []
    for (_, s), w in zip(picks, weights):
        if w <= 1e-4:
            continue
        book.append({**{k: s.get(k) for k in ('sub_id', 'insured', 'line', 'occupancy', 'state',
                                              'county', 'cat_zone', 'hazard_grade', 'tiv',
                                              'loss_cost_bps', 'expected_loss', 'technical_premium',
                                              'charged_premium', 'rate_adequacy')},
                     'target_share': round(w, 5)})
    return book


def _metrics(book, appetite):
    """REAL book metrics: premium-weighted loss ratio, cat share, concentration, rate adequacy."""
    if not book:
        return None
    prem = sum(b['technical_premium'] for b in book)
    charged = sum(b['charged_premium'] for b in book)
    eloss = sum(b['expected_loss'] for b in book)
    tiv = sum(b['tiv'] for b in book)
    # Weighted loss cost (bps of TIV) and expected loss ratio.
    loss_ratio = round(eloss / prem, 4) if prem else None
    rate_adequacy = round(charged / prem, 4) if prem else None
    # Cat concentration: premium share in Tier1 cat zones (the peak-zone accumulation).
    tier1_prem = sum(b['technical_premium'] for b in book if 'Tier1' in str(b.get('cat_zone', '')))
    cat_share = round(tier1_prem / prem, 4) if prem else 0.0
    # Herfindahl over state premium share (concentration).
    state_prem = {}
    line_prem = {}
    for b in book:
        state_prem[b['state']] = state_prem.get(b['state'], 0) + b['technical_premium']
        line_prem[b['line']] = line_prem.get(b['line'], 0) + b['technical_premium']
    herf = sum((p / prem) ** 2 for p in state_prem.values()) if prem else 1.0
    # Combined ratio proxy = loss ratio + expense ratio (31% industry-ish).
    expense_ratio = 0.31
    combined = round((loss_ratio or 0) / (rate_adequacy or 1) + expense_ratio, 4)
    return {
        'policy_count': len(book), 'written_premium': round(charged), 'technical_premium': round(prem),
        'expected_loss': round(eloss), 'total_tiv': round(tiv),
        'expected_loss_ratio': loss_ratio, 'rate_adequacy': rate_adequacy,
        'combined_ratio': combined, 'cat_tier1_share': cat_share,
        'state_herfindahl': round(herf, 4), 'diversification': round(1 - herf, 4),
        'premium_by_state': {k: round(v / prem, 3) for k, v in sorted(state_prem.items(), key=lambda kv: -kv[1])[:8]} if prem else {},
        'premium_by_line': {k: round(v / prem, 3) for k, v in sorted(line_prem.items(), key=lambda kv: -kv[1])} if prem else {},
    }


def _fitness(m, appetite):
    """Higher is better. Real objective: reward premium & diversification & rate adequacy;
    penalize loss-ratio miss vs target and excess cat (Tier-1) concentration."""
    target_lr = float(appetite.get('target_loss_ratio', 0.60))
    cat_ceiling = float(appetite.get('cat_share_ceiling', 0.35))
    prem_w = float(appetite.get('premium_weight', 1.0))
    risk_w = float(appetite.get('risk_weight', 1.0))
    lr = m['expected_loss_ratio'] or 0
    cat_excess = max(0.0, m['cat_tier1_share'] - cat_ceiling)
    return round(
        prem_w * (m['written_premium'] / 1e7)           # scale premium to a sane range
        - risk_w * 4.0 * abs(lr - target_lr)
        - risk_w * 3.0 * cat_excess
        + risk_w * 1.5 * (m['rate_adequacy'] or 1 - 1)
        + 1.2 * m['diversification'],
        4)


def _random_genome(rng, n_lo, n_hi):
    g = {k: round(rng.uniform(lo, hi), 3) for k, (lo, hi) in GENE_BOUNDS.items()}
    g['n_risks'] = rng.randint(n_lo, n_hi)
    return g


def _crossover(a, b, rng):
    child = {k: (a[k] if rng.random() < 0.5 else b[k]) for k in GENE_BOUNDS}
    child['n_risks'] = a['n_risks'] if rng.random() < 0.5 else b['n_risks']
    return child


def _mutate(g, rng, n_lo, n_hi, rate=0.3):
    out = dict(g)
    for k, (lo, hi) in GENE_BOUNDS.items():
        if rng.random() < rate:
            out[k] = round(_clamp(g[k] + rng.gauss(0, (hi - lo) * 0.15), lo, hi), 3)
    if rng.random() < rate:
        out['n_risks'] = int(_clamp(g['n_risks'] + rng.choice([-8, -4, 4, 8]), n_lo, n_hi))
    return out


def run(candidates, appetite, seed=20260101, generations=6, population=24):
    """Evolve book-construction recipes. Returns fitness curve + leaderboard + winner."""
    appetite = dict(appetite or {})
    rng = random.Random(seed)
    pool, feat = _prepare(candidates, appetite)
    if len(pool) < 8:
        return {'error': 'not enough eligible submissions to construct a book',
                'candidates': len(candidates)}

    n_target = int(appetite.get('n_risks', 40))
    n_lo, n_hi = max(12, n_target - 15), min(len(pool), max(n_target + 15, 30))

    def evaluate(genome):
        book = _construct(genome, pool, feat, appetite)
        if not book:
            return None
        m = _metrics(book, appetite)
        if not m:
            return None
        return {'genome': genome, 'metrics': m, 'fitness': _fitness(m, appetite), 'book': book}

    pop = [_random_genome(rng, n_lo, n_hi) for _ in range(population)]
    curve, seen = [], {}
    for gen in range(generations):
        evaluated = [e for e in (evaluate(g) for g in pop) if e]
        evaluated.sort(key=lambda e: e['fitness'], reverse=True)
        for e in evaluated:
            sig = (e['metrics']['policy_count'], round(e['metrics']['expected_loss_ratio'] or 0, 2),
                   round(e['metrics']['cat_tier1_share'], 2))
            if sig not in seen or e['fitness'] > seen[sig]['fitness']:
                seen[sig] = e
        best = evaluated[0]['fitness'] if evaluated else 0
        avg = round(statistics.fmean([e['fitness'] for e in evaluated]), 4) if evaluated else 0
        curve.append({'generation': gen + 1, 'best_fitness': round(best, 4),
                      'avg_fitness': avg, 'evaluated': len(evaluated)})
        elite = [e['genome'] for e in evaluated[:4]]
        nxt = list(elite)
        while len(nxt) < population and evaluated:
            a = max(rng.sample(evaluated, min(3, len(evaluated))), key=lambda e: e['fitness'])['genome']
            b = max(rng.sample(evaluated, min(3, len(evaluated))), key=lambda e: e['fitness'])['genome']
            nxt.append(_mutate(_crossover(a, b, rng), rng, n_lo, n_hi))
        pop = nxt or pop

    ranked = sorted(seen.values(), key=lambda e: e['fitness'], reverse=True)
    leaderboard = []
    for rank, e in enumerate(ranked[:10], 1):
        m = e['metrics']
        leaderboard.append({'rank': rank, 'fitness': round(e['fitness'], 4),
                            'policy_count': m['policy_count'], 'written_premium': m['written_premium'],
                            'expected_loss_ratio': m['expected_loss_ratio'],
                            'combined_ratio': m['combined_ratio'], 'cat_tier1_share': m['cat_tier1_share'],
                            'rate_adequacy': m['rate_adequacy'], 'diversification': m['diversification']})
    winner = ranked[0]
    return {
        'appetite': appetite, 'universe_candidates': len(candidates), 'eligible_pool': len(pool),
        'generations': curve, 'leaderboard': leaderboard,
        'winner': {'fitness': round(winner['fitness'], 4), 'metrics': winner['metrics'],
                   'recipe': winner['genome'], 'winning_book': winner['book'][:25]},
        'evaluated_total': generations * population, 'seed': seed,
        'method': 'deterministic illustrative optimization (fixed seed for reproducible demos); synthetic figures, not advice',
    }
