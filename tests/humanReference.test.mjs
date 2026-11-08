import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { encodeReference, normalizeReference, isValidReference, referencePrefixes, REFERENCE_ALPHABET } from "../src/humanReference.ts";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/human-reference-v1.json", import.meta.url), "utf8"));
test("all canonical Kotlin/TypeScript vectors agree", () => {
  assert.deepEqual(referencePrefixes, fixture.kinds);
  assert.equal(fixture.vectors.length, 19);
  for (const vector of fixture.vectors) {
    assert.equal(encodeReference(vector.kind, vector.payload), vector.reference);
    assert.equal(normalizeReference(vector.reference.toLowerCase().replaceAll("-", " ")), vector.reference);
    assert.equal(isValidReference(vector.reference, vector.kind), true);
    for (const kind of Object.keys(referencePrefixes).filter(kind => kind !== vector.kind)) assert.equal(isValidReference(vector.reference, kind), false);
  }
});
test("single symbol errors fail validation; normalizations never accept Unicode or control input", () => {
  for (const vector of fixture.vectors) {
    const symbols = vector.reference.replaceAll("-", "");
    for (let index=0; index<symbols.length; index++) {
      const replacement = REFERENCE_ALPHABET[(REFERENCE_ALPHABET.indexOf(symbols[index])+1)%32];
      assert.equal(isValidReference(symbols.slice(0,index)+replacement+symbols.slice(index+1)),false);
    }
    for (const invalid of ["", vector.reference.slice(1), vector.reference+"A", vector.reference+"\n", "Ｃ"+vector.reference.slice(1), vector.reference.replace("-","\t")]) assert.equal(normalizeReference(invalid),null);
  }
  assert.equal(normalizeReference("hoo ooo otp"), "H00-000-0TP");
});
