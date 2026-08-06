# Enigma + Bombe Simulator

**Author:** Ceye (Djad)

A historically accurate Enigma I machine simulator in JavaScript, plus a
crib-based cryptanalysis attack modeled on the Turing/Welchman Bombe.

## What's in here

- **`enigma.js`** — the machine itself: rotors I-V with real historical
  wirings, reflectors B/C, plugboard, and correct stepping including the
  **double-step anomaly** (the middle rotor stepping twice on consecutive
  keypresses when it's at its own notch — a quirk of the real hardware, not
  a bug).
- **`bombe.js`** — a crib-based attack. Given a known plaintext fragment
  (crib) and its ciphertext, it searches rotor orders and starting positions
  and uses **constraint propagation** to deduce whether a hypothesis could
  produce a self-consistent plugboard — exactly the logic the real Bombe's
  diagonal board used to reject wrong wheel settings without knowing the
  plugboard in advance.
- **`demo.js`** — runs all of the above: verifies the machine against the
  standard `AAAAA → BDZGO` test vector, does an encrypt/decrypt round trip,
  then runs a full crib attack and reports the recovered setting.

## Running it

```bash
node demo.js
```

No dependencies — plain Node.js.

## How the crib attack actually works

Enigma's plugboard is an unknown involution (a letter swaps with at most one
other letter, or with nothing). Given a rotor order + starting position
hypothesis, you can compute the machine's raw (plugboard-free) behavior at
every position in the crib. The trick — the same one Bletchley Park used —
is that you don't need to *know* the plugboard to test a hypothesis:

1. Guess that the crib's first plaintext letter plugs to some letter `X`
   (including possibly itself — unplugged).
2. That forces what the raw scrambler output must be, which forces what the
   plugboard must do to produce the *observed* ciphertext letter.
3. That new deduction, in turn, forces more deductions wherever those
   letters recur elsewhere in the crib.
4. If this propagation ever needs one letter to plug to two *different*
   letters, that's a **contradiction** — the hypothesis is impossible, and
   is rejected instantly regardless of the other 25 things it might have
   gotten right.
5. If propagation completes without contradiction and links a large enough
   share of the crib's positions, it's recorded as a **stop** — a genuine
   candidate worth checking by hand.

This mirrors two real historical shortcuts baked into `bombe.js`:

- **Enigma never encrypts a letter to itself.** Any crib position where
  plaintext and ciphertext match at the same index is a free, instant proof
  that hypothesis (or crib alignment) is wrong — checked before any search
  even starts.
- **Coverage matters.** A weak/short crib without repeated letters won't
  form enough loops to meaningfully constrain the search, and will produce
  many false "stops." `bombe.js` requires at least 50% of crib positions to
  be linked by the propagation before counting something as a real stop —
  the true setting should clear this comfortably, decoys mostly won't.

## Known limitations

- Ring settings are fixed at `AAA` during the crib search — cracking ring
  settings historically required a separate technique (Banburismus), not
  implemented here.
- The crib must start at the very first keypress of the message (position
  0). Searching for where in a longer message a crib fits is a further
  extension, not currently implemented.
- A 3-rotor pool searches in a few seconds; the full 5-rotor pool
  (60 orders × 17,576 positions × up to 26 plugboard seed hypotheses) takes
  roughly 30-40 seconds in Node — plenty fast for a demo, nowhere near what
  it'd take to brute-force by hand.

## Verification

`demo.js` checks the machine against the standard Enigma I test vector:
rotors I-II-III, reflector B, all ring/start settings at `A`, no plugboard,
encrypting `AAAAA` produces `BDZGO`. This is the standard sanity check used
to confirm an Enigma implementation's stepping and wiring are correct.
