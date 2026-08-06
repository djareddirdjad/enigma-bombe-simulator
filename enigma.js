// enigma.js — Historically accurate Enigma I simulator
// Rotor wirings, reflectors, and stepping (including the double-step anomaly)

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Historical rotor wirings (Enigma I / M3, rotors I-V) and their notch positions
const ROTORS = {
  I:   { wiring: "EKMFLGDQVZNTOWYHXUSPAIBRCJ", notch: "Q" },
  II:  { wiring: "AJDKSIRUXBLHWTMCQGZNPYFVOE", notch: "E" },
  III: { wiring: "BDFHJLCPRTXVZNYEIWGAKMUSQO", notch: "V" },
  IV:  { wiring: "ESOVPZJAYQUIRHXLNFTGKDCMWB", notch: "J" },
  V:   { wiring: "VZBRGITYUPSDNHLXAWMJQOFECK", notch: "Z" },
};

const REFLECTORS = {
  B: "YRUHQSLDPXNGOKMIEBFZCWVJAT",
  C: "FVPJIAOYEDRZXWGCTKUQSBNMHL",
};

function idx(c) { return ALPHA.indexOf(c); }
function chr(i) { return ALPHA[((i % 26) + 26) % 26]; }

class Rotor {
  constructor(name, ringSetting = "A", startPos = "A") {
    const spec = ROTORS[name];
    if (!spec) throw new Error(`Unknown rotor: ${name}`);
    this.name = name;
    this.wiring = spec.wiring;
    this.notch = spec.notch;
    this.ring = idx(ringSetting);   // Ringstellung offset
    this.pos = idx(startPos);       // Grundstellung (current rotor position)
  }

  atNotch() {
    return chr(this.pos) === this.notch;
  }

  step() {
    this.pos = (this.pos + 1) % 26;
  }

  // Signal enters from the right (forward pass)
  forward(c) {
    const shift = this.pos - this.ring;
    const entry = ((c + shift) % 26 + 26) % 26;
    const wired = idx(this.wiring[entry]);
    return ((wired - shift) % 26 + 26) % 26;
  }

  // Signal returns from the left (backward pass through reflector)
  backward(c) {
    const shift = this.pos - this.ring;
    const entry = ((c + shift) % 26 + 26) % 26;
    const wired = this.wiring.indexOf(chr(entry));
    return ((wired - shift) % 26 + 26) % 26;
  }
}

class Plugboard {
  constructor(pairs = []) {
    this.map = {};
    for (let i = 0; i < 26; i++) this.map[i] = i;
    for (const pair of pairs) {
      const [a, b] = pair.toUpperCase().split("");
      this.map[idx(a)] = idx(b);
      this.map[idx(b)] = idx(a);
    }
  }
  swap(c) { return this.map[c]; }
}

class Enigma {
  /**
   * @param {string[]} rotorNames - e.g. ["I","II","III"], left to right (slow to fast)
   * @param {string} reflectorName - "B" or "C"
   * @param {string[]} ringSettings - e.g. ["A","A","A"], same order as rotorNames
   * @param {string[]} startPositions - e.g. ["A","A","A"], same order
   * @param {string[]} plugPairs - e.g. ["AB","CD"]
   */
  constructor(rotorNames, reflectorName, ringSettings, startPositions, plugPairs = []) {
    this.rotors = rotorNames.map((name, i) =>
      new Rotor(name, ringSettings[i], startPositions[i])
    );
    this.reflector = REFLECTORS[reflectorName];
    this.plugboard = new Plugboard(plugPairs);
  }

  // The famous double-step anomaly:
  // - The right (fast) rotor always steps.
  // - The middle rotor steps if the right rotor was at its notch, OR
  //   if the middle rotor itself is at its notch (causing it to step twice
  //   in consecutive keypresses — the "double step").
  // - The left rotor steps only when the middle rotor was at its notch.
  stepRotors() {
    const [left, mid, right] = this.rotors;
    const midAtNotch = mid.atNotch();
    const rightAtNotch = right.atNotch();

    if (midAtNotch) {
      left.step();
      mid.step();
    } else if (rightAtNotch) {
      mid.step();
    }
    right.step();
  }

  encryptChar(ch) {
    if (!ALPHA.includes(ch)) return ch; // pass through non-alpha unchanged
    this.stepRotors();

    let c = idx(ch);
    c = this.plugboard.swap(c);

    // forward through rotors, right to left
    for (let i = this.rotors.length - 1; i >= 0; i--) {
      c = this.rotors[i].forward(c);
    }

    // reflector
    c = idx(this.reflector[c]);

    // backward through rotors, left to right
    for (let i = 0; i < this.rotors.length; i++) {
      c = this.rotors[i].backward(c);
    }

    c = this.plugboard.swap(c);
    return chr(c);
  }

  encrypt(text) {
    return text
      .toUpperCase()
      .split("")
      .map((ch) => this.encryptChar(ch))
      .join("");
  }

  positions() {
    return this.rotors.map((r) => chr(r.pos)).join("");
  }
}

module.exports = { Enigma, Rotor, Plugboard, ALPHA, ROTORS, REFLECTORS, idx, chr };
