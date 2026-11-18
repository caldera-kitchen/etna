// Exact arithmetic for quantities: every number is held as a fraction of two integers.
//
// Integers, fractions and mixed numbers are rational by construction; a decimal is read from
// its text (`2.15` = 215/100), never from its floating-point value, so sums carry no noise.

import type { NumberValue, Quantity } from '../core/index.ts';

export interface Rational {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function rational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new Error('zero denominator');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

/** The exact value of one parsed number. */
export function toRational(n: NumberValue): Rational {
  if (n.style === 'decimal') {
    const m = /^(\d*)\.(\d+)$/.exec(n.text.trim());
    if (!m) return rational(BigInt(Math.round(n.value * 1e6)), 1000000n);
    const digits = m[2];
    return rational(BigInt((m[1] || '0') + digits), 10n ** BigInt(digits.length));
  }
  if (n.style === 'integer') return rational(BigInt(n.whole));
  return rational(BigInt(n.whole) * BigInt(n.den) + BigInt(n.num), BigInt(n.den));
}

/** A quantity as an exact `[min, max]` pair; a single number is its own range. */
export interface RationalRange {
  min: Rational;
  max: Rational;
  range: boolean;
  /** True when any number that went in was written as a decimal. */
  decimal: boolean;
}

export function rangeOf(q: Quantity): RationalRange {
  const min = toRational(q.min);
  const max = q.max ? toRational(q.max) : min;
  return { min, max, range: q.max !== null, decimal: q.min.style === 'decimal' || (q.max !== null && q.max.style === 'decimal') };
}

export function addRanges(a: RationalRange, b: RationalRange): RationalRange {
  return { min: add(a.min, b.min), max: add(a.max, b.max), range: a.range || b.range, decimal: a.decimal || b.decimal };
}

/** Decimal digits of `r` when it terminates within 12 places, else null. */
function decimalText(r: Rational): string | null {
  let den = r.den;
  let places = 0;
  while (den % 2n === 0n || den % 5n === 0n) {
    if (den % 2n === 0n) den /= 2n;
    if (den % 5n === 0n) den /= 5n;
    places++;
  }
  if (den !== 1n || places > 12) return null;
  // Find the smallest number of places that represents r exactly.
  for (let k = 0; k <= places; k++) {
    const scale = 10n ** BigInt(k);
    if ((r.num * scale) % r.den !== 0n) continue;
    const scaled = (r.num * scale) / r.den;
    if (k === 0) return scaled.toString();
    const s = scaled.toString().padStart(k + 1, '0');
    return `${s.slice(0, -k)}.${s.slice(-k)}`;
  }
  return null;
}

/**
 * Build a `NumberValue` for an exact value. Whole numbers are integers. Otherwise a decimal
 * when `decimal` is set and the value terminates; else a fraction (below one) or a mixed
 * number — so `0.5 + 1/3` stays exact as `5/6` rather than becoming `0.8333…`.
 */
export function toNumberValue(r: Rational, decimal: boolean): NumberValue {
  const value = Number(r.num) / Number(r.den);
  if (r.den === 1n) {
    const whole = Number(r.num);
    return { value: whole, text: String(whole), style: 'integer', unicode: false, whole, num: 0, den: 1 };
  }
  if (decimal) {
    const text = decimalText(r);
    if (text !== null) return { value: Number(text), text, style: 'decimal', unicode: false, whole: 0, num: 0, den: 1 };
  }
  const whole = r.num / r.den;
  const num = Number(r.num % r.den);
  const den = Number(r.den);
  if (whole === 0n) return { value, text: `${num}/${den}`, style: 'fraction', unicode: false, whole: 0, num, den };
  return { value, text: `${whole} ${num}/${den}`, style: 'mixed', unicode: false, whole: Number(whole), num, den };
}

export function toQuantity(r: RationalRange): Quantity {
  const min = toNumberValue(r.min, r.decimal);
  const max = r.range ? toNumberValue(r.max, r.decimal) : null;
  return { raw: max ? `${min.text}-${max.text}` : min.text, min, max, rangeSeparator: max ? '-' : null };
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new Error('division by zero');
  return rational(a.num * b.den, a.den * b.num);
}

export function compare(a: Rational, b: Rational): number {
  const d = a.num * b.den - b.num * a.den;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

export function toNumber(r: Rational): number {
  return Number(r.num) / Number(r.den);
}

/** The exact value of a finite JavaScript number as written in its shortest decimal form (`28.3495`). */
export function fromNumber(n: number): Rational {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  if (Number.isInteger(n)) return rational(BigInt(n));
  const text = String(n);
  const m = /^(-?)(\d*)\.(\d+)$/.exec(text);
  if (!m) return rational(BigInt(Math.round(n * 1e9)), 1000000000n);
  const value = rational(BigInt((m[2] || '0') + m[3]), 10n ** BigInt(m[3].length));
  return m[1] ? rational(-value.num, value.den) : value;
}

/** Round to the nearest multiple of `step` (half away from zero). */
export function roundTo(r: Rational, step: Rational): Rational {
  const units = div(r, step);
  const twice = (2n * units.num) / units.den;
  const n = twice >= 0n ? (twice + 1n) / 2n : (twice - 1n) / 2n;
  return mul(rational(n), step);
}

export function scaleRange(r: RationalRange, factor: Rational): RationalRange {
  return { ...r, min: mul(r.min, factor), max: mul(r.max, factor) };
}
