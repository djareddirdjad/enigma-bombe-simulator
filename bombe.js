// bombe.js — crib-based attack on the Enigma, using constraint propagation
// (a simplified version of the historical Turing/Welchman Bombe's "menu" logic)
//
// Given a known crib (plaintext fragment) and its corresponding ciphertext,
// this searches rotor orders and starting positions. For each hypothesis it
// propagates plugboard deductions through the crib exactly like the real
// Bombe's diagonal board: assume one letter is unplugged, derive what the
// plugboard must do at every other position, and reject any hypothesis that
// produces a contradiction (a letter forced to plug to two different letters).

const { ROTORS, REFLECTORS, ALPHA, idx, chr } = require("./enigma.js");

function permutations(arr, size) {
  const results = [];
  function helper(prefix, remaining) {
    if (prefix.length === size) {
      results.push(prefix);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      helper(
        [...prefix, remaining[i]],
        remaining.slice(0, i).concat(remaining.slice(i + 1))
      );
    }
  }
  helper([], arr);
  return results;
}

// Step the given rotor position-array forward one keypress, applying the
// double-step anomaly. rotors: [{pos, notch}, ...] left to right.
function stepPositions(rotorState) {
  const [left, mid, right] = rotorState;
  const midAtNotch = chr(mid.pos) === mid.notch;
  const rightAtNotch = chr(right.pos) === right.notch;

  if (midAtNotch) {
    left.pos = (left.pos + 1) % 26;
    mid.pos = (mid.pos + 1) % 26;
  } else if (rightAtNotch) {
    mid.pos = (mid.pos + 1) % 26;
  }
  right.pos = (right.pos + 1) % 26;
}

// Raw (plugboard-free) scramble of a single letter through rotors + reflector,
// at the stepping state after `count` keypresses from the given start.
function rawScrambleSequence(rotorNames, reflectorName, startPositions, length) {
  const rotorState = rotorNames.map((name, i) => ({
    wiring: ROTORS[name].wiring,
    notch: ROTORS[name].notch,
    ring: 0, // ring settings fixed at 'A' for this search — a real Bombe
             // run treats ring setting as a separate deduction (Banburismus)
    pos: idx(startPositions[i]),
  }));
  const reflector = REFLECTORS[reflectorName];

  // returns a function scramble(position, inputCharIndex) -> outputCharIndex
  const statesAtEachStep = [];
  for (let k = 0; k < length; k++) {
    stepPositions(rotorState);
    // snapshot positions after this keypress
    statesAtEachStep.push(rotorState.map((r) => r.pos));
  }

  function scramble(position, cIn) {
    const positions = statesAtEachStep[position];
    let c = cIn;
    for (let i = rotorState.length - 1; i >= 0; i--) {
      const shift = positions[i] - rotorState[i].ring;
      const entry = ((c + shift) % 26 + 26) % 26;
      c = idx(rotorState[i].wiring[entry]);
      c = ((c - shift) % 26 + 26) % 26;
    }
    c = idx(reflector[c]);
    for (let i = 0; i < rotorState.length; i++) {
      const shift = positions[i] - rotorState[i].ring;
      const entry = ((c + shift) % 26 + 26) % 26;
      c = rotorState[i].wiring.indexOf(chr(entry));
      c = ((c - shift) % 26 + 26) % 26;
    }
    return c;
  }

  return scramble;
}

// Try to propagate a full plugboard hypothesis for one rotor-order/start
// hypothesis. seedPlain is the crib index used as the "assume unplugged"
// starting point. Returns { ok, map } — map is the deduced plugboard (partial).
function tryPropagate(scramble, plainArr, cipherArr, seedIndex, seedPartner) {
  const map = {}; // letter index -> letter index, symmetric (involution)

  function setPair(a, b) {
    if (map[a] !== undefined) {
      if (map[a] !== b) return false;
    } else {
      map[a] = b;
    }
    if (map[b] !== undefined) {
      if (map[b] !== a) return false;
    } else {
      map[b] = a;
    }
    return true;
  }

  // Seed: hypothesize the crib's seed-position plaintext letter is plugged
  // to `seedPartner` (which may be itself, i.e. unplugged). The real Bombe
  // couldn't assume any particular letter was unplugged either — it had to
  // consider every possibility, which is exactly what the caller does by
  // trying all 26 values of seedPartner per rotor/start hypothesis.
  const seedLetter = idx(plainArr[seedIndex]);
  if (!setPair(seedLetter, seedPartner)) return { ok: false };

  let changed = true;
  const processed = new Set();
  while (changed) {
    changed = false;
    for (let i = 0; i < plainArr.length; i++) {
      const pLetter = idx(plainArr[i]);
      const cLetter = idx(cipherArr[i]);
      if (map[pLetter] === undefined) continue;
      const key = `${i}`;
      const p = map[pLetter];
      const r = scramble(i, p);
      if (!setPair(r, cLetter)) return { ok: false };
      if (!processed.has(key)) {
        processed.add(key);
        changed = true;
      }
    }
  }

  return { ok: true, map, coverage: processed.size, total: plainArr.length };
}

/**
 * Crack rotor order + start position from a known crib.
 * @param {string} crib - known plaintext fragment
 * @param {string} cipherSegment - corresponding ciphertext (same length as crib)
 * @param {string} reflectorName - "B" or "C"
 * @param {string[]} rotorPool - which rotors are in play, e.g. ["I","II","III","IV","V"]
 * @param {number} rotorCount - how many rotors the machine uses (usually 3)
 */
function crackWithCrib(crib, cipherSegment, reflectorName = "B", rotorPool = ["I", "II", "III", "IV", "V"], rotorCount = 3) {
  if (crib.length !== cipherSegment.length) {
    throw new Error("crib and cipherSegment must be the same length");
  }
  const plainArr = crib.toUpperCase().split("");
  const cipherArr = cipherSegment.toUpperCase().split("");

  // Enigma never encrypts a letter to itself — a fast, free filter that the
  // real cryptanalysts used first, before any machine time was spent.
  for (let i = 0; i < plainArr.length; i++) {
    if (plainArr[i] === cipherArr[i]) {
      return { found: false, reason: `Crib impossible: position ${i} maps '${plainArr[i]}' to itself` };
    }
  }

  const rotorOrders = permutations(rotorPool, rotorCount);
  const stops = [];

  for (const order of rotorOrders) {
    for (let a = 0; a < 26; a++) {
      for (let b = 0; b < 26; b++) {
        for (let c = 0; c < 26; c++) {
          const start = [chr(a), chr(b), chr(c)];
          const scramble = rawScrambleSequence(order, reflectorName, start, plainArr.length);
          // A hypothesis "stops" if constraint propagation reaches a
          // self-consistent plugboard assignment on every crib position it's
          // able to link, for AT LEAST ONE of the 26 possible seed partners
          // (we don't know in advance whether the seed letter is unplugged
          // or which letter it's plugged to — the real Bombe's diagonal
          // board effectively tested all of these simultaneously). A
          // contradiction under every seed partner means this rotor
          // order/start is genuinely impossible, exactly like the real
          // machine rejecting a wheel order/position outright.
          // A short chain touching only 2-3 positions passes "no
          // contradiction" almost trivially and proves little — real cribs
          // rarely link every single position (not every letter recurs
          // often enough to form a loop), so we track the BEST coverage any
          // seed hypothesis achieves and require it to clear a real bar,
          // then rank candidates by coverage. The true setting should stand
          // out well above the noise floor of unrelated wheel orders.
          let bestResult = null;
          for (let seedPartner = 0; seedPartner < 26; seedPartner++) {
            const result = tryPropagate(scramble, plainArr, cipherArr, 0, seedPartner);
            if (result.ok && (!bestResult || result.coverage > bestResult.coverage)) {
              bestResult = result;
              if (bestResult.coverage === bestResult.total) break; // can't do better
            }
          }
          if (bestResult && bestResult.coverage / bestResult.total >= 0.5) {
            stops.push({
              order,
              start: start.join(""),
              plugMap: bestResult.map,
              linked: bestResult.coverage,
              total: bestResult.total,
            });
          }
        }
      }
    }
  }

  stops.sort((a, b) => b.linked / b.total - a.linked / a.total);
  return { found: stops.length > 0, stops };
}

module.exports = { crackWithCrib, rawScrambleSequence, tryPropagate };
