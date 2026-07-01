# Checkout Darts Formulas

The checkout-attempts modal asks the player how many darts they
had available for the close-out. The engine helper
`maxCheckoutAttemptsForX01(target, total, inOut, isLegWin)`
encodes the rules in this file. The same rules drive the
modal: button `n` is enabled when `n <= max`, where `max` is
the value returned by the formula.

## Cells

- `B2` = target (the player's score at the start of the turn)
- `C2` = total (the player's actual points scored this turn)
- `D2` = `B2 - C2` (remaining after the throw)

The "out rule" (DO, MO, SO, TO) is passed separately via
`inOut.out` and changes the legal-finisher set, which in turn
changes which targets are 1-/2-/3-dart closable.

## Double Out (DO)

A DO close-out requires the final dart to be a double (D1..D20
or D-Bull). The Excel formula:

```
=IF(D2=0;
    IF(OR(AND(C2<=40, MOD(C2,2)=0), C2=50);
        3;
        IF(AND(C2<=100, NOT(OR(C2=91, C2=93, C2=95, C2=97, C2=99)));
            2;
            1));
    IF(OR(B2>170,
          OR(B2=159, B2=162, B2=163, B2=165, B2=166, B2=168, B2=169),
          B2=1,
          D2<0,
          D2=1);
        0;
        IF(OR(AND(B2<=40, MOD(B2,2)=0), B2=50);
            3;
            IF(AND(B2<=100, NOT(OR(B2=91, B2=93, B2=95, B2=97, B2=99)));
                IF(C2>=(B2-40);
                    2;
                    IF(C2>=(B2-50);
                        1;
                        0));
                IF(C2>=(B2-40);
                    1;
                    0)))))
```

### DO — leg-win branch (`D2=0`)

| Condition | max |
|---|---|
| `C2<=40` and `C2` is even (D1..D20) OR `C2=50` (D-Bull) | 3 |
| `C2<=100` and not in {91, 93, 95, 97, 99} (2-dart-closable) | 2 |
| otherwise (3-dart finish, e.g. 170 = T20+T20+BULL) | 1 |

### DO — non-leg-win branch

Guard returns 0 when: `B2>170` (out of range), `B2` is in the
3-dart-unclosable set {1, 159, 162, 163, 165, 166, 168, 169,
170}, `B2=1`, `D2<0` (bust), or `D2=1` (can't be closed even
with a D).

| Condition | max |
|---|---|
| `B2<=40` and even, or `B2=50` (1-dart DO target) | 3 |
| `B2<=100` not in {91, 93, 95, 97, 99} AND `C2>=B2-40` (1-dart close for remaining) | 2 |
| `B2<=100` not in {91, 93, 95, 97, 99} AND `C2>=B2-50` (D-Bull still closeable) | 1 |
| `B2 in {101..170}` AND `C2>=B2-40` (1-dart close for remaining) | 1 |
| otherwise | 0 |

## Master Out (MO)

An MO close-out requires the final dart to be a double, a
triple, or the double bull (D25 = 50). The standard "master
out" definition. The Excel formula:

```
=IF(D2=0;
    IF(OR(AND(C2<=60, OR(MOD(C2,2)=0, MOD(C2,3)=0)), C2=50);
        3;
        IF(C2<=120;
            2;
            1));
    IF(OR(B2>180, D2<0, D2=1);
        0;
        IF(OR(AND(B2<=60, OR(MOD(B2,2)=0, MOD(B2,3)=0)), B2=50);
            3;
            IF(B2<=120;
                IF(C2>=(B2-60);
                    2;
                    0);
                IF(C2>=(B2-60);
                    1;
                    0)))))
```

### MO — leg-win branch (`D2=0`)

| Condition | max |
|---|---|
| `C2<=60` and (even or divisible by 3), or `C2=50` (1-dart MO) | 3 |
| `C2<=120` (2-dart MO close exists) | 2 |
| otherwise (3-dart MO close) | 1 |

### MO — non-leg-win branch

Guard returns 0 when: `B2>180` (out of range), `D2<0` (bust),
or `D2=1` (1 can't be closed even with a D or T).

| Condition | max |
|---|---|
| `B2<=60` and (even or divisible by 3), or `B2=50` (1-dart MO target) | 3 |
| `B2<=120` AND `C2>=B2-60` (1-dart close for remaining exists) | 2 |
| `B2 in {121..180}` AND `C2>=B2-60` (1-dart close for remaining exists) | 1 |
| otherwise | 0 |

## Single Out (SO)

An SO close-out can be any single, double, triple, or
S/D-Bull. The Excel formula:

```
=IF(D2=0;
    IF(C2<=60;
        3;
        IF(C2<=120;
            2;
            1));
    IF(OR(B2>180, D2<0);
        0;
        IF(B2<=60;
            3;
            IF(B2<=120;
                IF(C2>=(B2-60);
                    2;
                    0);
                IF(C2>=(B2-60);
                    1;
                    0)))))
```

### SO — leg-win branch (`D2=0`)

| Condition | max |
|---|---|
| `C2<=60` (1-dart SO close) | 3 |
| `C2<=120` (2-dart SO close) | 2 |
| otherwise (3-dart SO close) | 1 |

### SO — non-leg-win branch

Guard returns 0 when: `B2>180` (out of range) or `D2<0` (bust).

| Condition | max |
|---|---|
| `B2<=60` (1-dart SO target) | 3 |
| `B2<=120` AND `C2>=B2-60` (1-dart close for remaining exists) | 2 |
| `B2 in {121..180}` AND `C2>=B2-60` (1-dart close for remaining exists) | 1 |
| otherwise | 0 |

## Triple Out (TO)

A TO close-out requires the final dart to be a triple (T1..T20)
or the double bull (D25 = 50). The standard "triple out"
definition. The Excel formula:

```
=IF(D2=0;
    IF(OR(AND(C2<=60, MOD(C2,3)=0), C2=50);
        3;
        IF(C2<=120;
            2;
            1));
    IF(OR(B2>180, D2<0, D2=1, D2=2);
        0;
        IF(OR(AND(B2<=60, MOD(B2,3)=0), B2=50);
            3;
            IF(B2<=120;
                IF(C2>=(B2-60);
                    2;
                    0);
                IF(C2>=(B2-60);
                    1;
                    0)))))
```

### TO — leg-win branch (`D2=0`)

| Condition | max |
|---|---|
| `C2<=60` and divisible by 3, or `C2=50` (1-dart TO close) | 3 |
| `C2<=120` (2-dart TO close exists) | 2 |
| otherwise (3-dart TO close) | 1 |

### TO — non-leg-win branch

Guard returns 0 when: `B2>180` (out of range), `D2<0` (bust),
`D2=1`, or `D2=2` (1 and 2 are too small for any 1-dart TO
close — the smallest legal TO finisher is T1=3, so any
remaining < 3 means no TO close is possible).

| Condition | max |
|---|---|
| `B2<=60` and divisible by 3, or `B2=50` (1-dart TO target) | 3 |
| `B2 in {61..120}` AND `C2>=B2-60` (1-dart close for remaining exists) | 2 |
| `B2 in {121..180}` AND `C2>=B2-60` (1-dart close for remaining exists) | 1 |
| otherwise | 0 |

## Modal behaviour summary

- The modal fires for X01 turns at a closable target
  (the engine's `shouldAskCheckout()` gate). It does NOT
  fire for non-closable targets or for innings where the
  player did not have any checkout attempt.
- Button 0 = "BUST" (no check-out). Always enabled when
  the modal is shown.
- Buttons 1, 2, 3 are enabled when `n <= max`, where `max`
  is the value returned by the formula for the current
  target / total / out-rule. The "minDarts" gate (counts
  BELOW the optimal close-out budget for the target) is
  enforced by the `isClosableX01()` check, not the formula
  here.

## Cross-references

- Engine source: `js/game/engine.js`,
  `maxCheckoutAttemptsForX01()` and the per-out
  `UNCLOSABLE[budget]` sets.
- Modal source: `js/ui/screens.js`,
  `maybeAskCheckoutAttempts()`.
- Engine helper for closability: `isClosableX01(target,
  inOut, budget)`.
- Engine helper for 1-dart finisher checks:
  `isOneDartDO`, `isOneDartMO`, `isOneDartSO` (defined
  inline in `maxCheckoutAttemptsForX01`).
- The "C2 >= B2-X" gate: in MO/SO/TO the threshold is
  `B2-60` (a 1-dart close needs remaining ≤ 60 for those
  out rules). In DO the threshold is `B2-40` because the
  largest 1-dart DO close is D20=40 (D-BULL=50 is the
  only 50, so `B2-50` is a tighter second-tier gate for
  DO when the player has only just left a BULL).
