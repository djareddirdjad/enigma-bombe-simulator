// demo.js — quick demonstration of both the Enigma simulator and the
// crib-based Bombe attack. Run with: node demo.js

const { Enigma } = require("./enigma.js");
const { crackWithCrib } = require("./bombe.js");

console.log("=== 1. Historical test vector ===");
const ref = new Enigma(["I", "II", "III"], "B", ["A", "A", "A"], ["A", "A", "A"], []);
const out = ref.encrypt("AAAAA");
console.log(`AAAAA -> ${out}  (expected BDZGO)  ${out === "BDZGO" ? "PASS" : "FAIL"}`);

console.log("\n=== 2. Encrypt/decrypt round trip (with plugboard) ===");
const settings = {
  rotors: ["IV", "II", "V"],
  reflector: "B",
  rings: ["A", "A", "A"],
  start: ["M", "X", "Q"],
  plugs: ["AB", "QW", "ER"],
};
const enc = new Enigma(settings.rotors, settings.reflector, settings.rings, settings.start, settings.plugs);
const dec = new Enigma(settings.rotors, settings.reflector, settings.rings, settings.start, settings.plugs);
const message = "ATTACKATDAWNONTHENORTHFLANK";
const ciphertext = enc.encrypt(message);
const decrypted = dec.encrypt(ciphertext); // Enigma is reciprocal: same settings decrypt

console.log(`plain : ${message}`);
console.log(`cipher: ${ciphertext}`);
console.log(`back  : ${decrypted}  ${decrypted === message ? "PASS" : "FAIL"}`);

console.log("\n=== 3. Crib-based attack (constraint propagation) ===");
console.log("Cracking rotor order + start position from a known crib...");
console.log("(unknown to the attack: rotors, start position, plugboard)\n");

// Using the full message as the crib here for a clean, fast demo stop.
// Shorter/partial cribs work too, but need enough repeated letters to form
// loops in the propagation graph — see README for the coverage tradeoff.
const crib = message;
const cribCipher = ciphertext;
console.time("search time");
const result = crackWithCrib(crib, cribCipher, "B", ["I", "II", "III", "IV", "V"], 3);
console.timeEnd("search time");

if (result.found) {
  console.log(`\nFound ${result.stops.length} stop(s):`);
  for (const s of result.stops) {
    console.log(`  rotors=${s.order.join(",")}  start=${s.start}  (${s.linked}/${s.total} crib positions linked)`);
  }
} else {
  console.log("\nNo stops found (crib may be too short, or contained a contradiction).");
  if (result.reason) console.log(result.reason);
}
