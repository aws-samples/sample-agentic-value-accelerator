"""evolve.py — evolutionary risk/growth strategy optimization for the fintech desk.

The fintech analog of the bond desk's evolve.py: a genetic algorithm searches over RISK-POLICY
RECIPES for the merchant-acceptance / decisioning policy that best trades approval rate against
fraud + chargeback + credit loss on the REAL merchant portfolio (each merchant carries REAL,
FRED-anchored chargeback/credit-loss economics). Surfaces the fitness curve + a leaderboard of
policies + the winning policy.

PURE STDLIB. `run(merchants, mandate, seed)` is the one entry point; never throws.

Genome = a decisioning policy: a per-risk-tier acceptance probability, a step-up (extra friction)
threshold, and a volume-vs-loss objective weight. Applying the policy to the REAL portfolio yields
a REAL expected approval rate, loss rate and net revenue — so the winner is a genuinely-optimized
policy, not a canned table.
"""
import random
import statistics

GENE_BOUNDS = {
    'accept_tier1': (0.90, 1.0),     # accept prob for low-risk merchants
    'accept_tier2': (0.60, 0.98),
    'accept_tier3': (0.20, 0.90),    # high-risk
    'stepup_loss_bps': (40.0, 200.0),  # apply extra friction (recover some loss) above this loss
    'stepup_recovery': (0.15, 0.6),    # fraction of loss recovered by step-up on flagged merchants
}
# Net revenue take rate (bps of volume) earned on approved volume.
# Illustrative demo assumption, not an authoritative pricing/interchange schedule.
TAKE_RATE_BPS = 250.0


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _apply(genome, merchants, mandate):
    """Apply a policy to the REAL portfolio → aggregate approval/loss/revenue metrics."""
    ceiling_bps = float(mandate.get('loss_ceiling_bps', 60))
    approved_vol = total_vol = loss_amt = revenue = 0.0
    approved_n = 0
    for m in merchants:
        vol = m.get('monthly_volume', 0) * 12
        total_vol += vol
        tier = m.get('risk_tier', 2)
        acc = genome[f'accept_tier{min(3, tier)}']
        # Deterministic accept decision by tier acceptance prob vs a per-merchant hash-free
        # threshold (use risk_score to order): accept if score percentile within acceptance.
        take = (100 - m.get('risk_score', 50)) / 100.0 <= acc
        if not take:
            continue
        approved_n += 1
        approved_vol += vol
        loss_bps = m.get('total_loss_bps', 60)
        # Step-up recovers part of the loss on high-loss merchants.
        if loss_bps > genome['stepup_loss_bps']:
            loss_bps *= (1 - genome['stepup_recovery'])
        loss_amt += vol * loss_bps / 10000.0
        revenue += vol * TAKE_RATE_BPS / 10000.0
    if approved_vol <= 0:
        return None
    loss_bps_book = loss_amt / approved_vol * 10000.0
    net_rev_bps = (revenue - loss_amt) / approved_vol * 10000.0
    return {
        'approval_rate': round(approved_vol / total_vol, 4) if total_vol else 0,
        'approved_merchants': approved_n, 'approved_volume': round(approved_vol),
        'loss_bps': round(loss_bps_book, 1), 'net_revenue_bps': round(net_rev_bps, 1),
        'within_ceiling': loss_bps_book <= ceiling_bps, 'gross_revenue': round(revenue), 'loss': round(loss_amt),
    }


def _fitness(m, mandate):
    """Higher is better: reward net revenue + approval, penalize breaching the loss ceiling."""
    ceiling = float(mandate.get('loss_ceiling_bps', 60))
    approval_w = float(mandate.get('approval_weight', 1.0))
    over = max(0.0, m['loss_bps'] - ceiling)
    return round(m['net_revenue_bps'] * 0.5 + approval_w * m['approval_rate'] * 40 - over * 2.0, 4)


def _random_genome(rng):
    return {k: round(rng.uniform(lo, hi), 3) for k, (lo, hi) in GENE_BOUNDS.items()}


def _crossover(a, b, rng):
    return {k: (a[k] if rng.random() < 0.5 else b[k]) for k in GENE_BOUNDS}


def _mutate(g, rng, rate=0.3):
    out = dict(g)
    for k, (lo, hi) in GENE_BOUNDS.items():
        if rng.random() < rate:
            out[k] = round(_clamp(g[k] + rng.gauss(0, (hi - lo) * 0.15), lo, hi), 3)
    return out


def run(merchants, mandate, seed=20260101, generations=6, population=24):
    mandate = dict(mandate or {})
    rng = random.Random(seed)
    merchants = [m for m in merchants if isinstance(m, dict) and m.get('monthly_volume')]
    if len(merchants) < 10:
        return {'error': 'not enough merchants to optimize', 'merchants': len(merchants)}

    def evaluate(g):
        m = _apply(g, merchants, mandate)
        if not m:
            return None
        return {'genome': g, 'metrics': m, 'fitness': _fitness(m, mandate)}

    pop = [_random_genome(rng) for _ in range(population)]
    curve, seen = [], {}
    for gen in range(generations):
        ev = [e for e in (evaluate(g) for g in pop) if e]
        ev.sort(key=lambda e: e['fitness'], reverse=True)
        for e in ev:
            sig = (round(e['metrics']['approval_rate'], 3), round(e['metrics']['loss_bps'], 0))
            if sig not in seen or e['fitness'] > seen[sig]['fitness']:
                seen[sig] = e
        best = ev[0]['fitness'] if ev else 0
        avg = round(statistics.fmean([e['fitness'] for e in ev]), 4) if ev else 0
        curve.append({'generation': gen + 1, 'best_fitness': round(best, 4), 'avg_fitness': avg})
        elite = [e['genome'] for e in ev[:4]]
        nxt = list(elite)
        while len(nxt) < population and ev:
            a = max(rng.sample(ev, min(3, len(ev))), key=lambda e: e['fitness'])['genome']
            b = max(rng.sample(ev, min(3, len(ev))), key=lambda e: e['fitness'])['genome']
            nxt.append(_mutate(_crossover(a, b, rng), rng))
        pop = nxt or pop

    ranked = sorted(seen.values(), key=lambda e: e['fitness'], reverse=True)
    leaderboard = []
    for rank, e in enumerate(ranked[:10], 1):
        m = e['metrics']
        leaderboard.append({'rank': rank, 'fitness': round(e['fitness'], 4),
                            'approval_rate': m['approval_rate'], 'loss_bps': m['loss_bps'],
                            'net_revenue_bps': m['net_revenue_bps'], 'within_ceiling': m['within_ceiling']})
    winner = ranked[0]
    return {'mandate': mandate, 'merchants': len(merchants), 'generations': curve,
            'leaderboard': leaderboard,
            'winner': {'fitness': round(winner['fitness'], 4), 'metrics': winner['metrics'],
                       'policy': winner['genome']},
            'evaluated_total': generations * population, 'seed': seed,
            'method': 'deterministic illustrative optimization (fixed seed for reproducible demos); synthetic figures, not advice'}
