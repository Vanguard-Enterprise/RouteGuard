// Stub for @mapbox/point-geometry — required by mapbox-gl types
declare class Point {
  x: number
  y: number
  constructor(x: number, y: number)
  clone(): Point
  add(p: Point): Point
  sub(p: Point): Point
  mult(k: number): Point
  div(k: number): Point
  rotate(a: number): Point
  matMult(m: [number, number, number, number]): Point
  unit(): Point
  perp(): Point
  round(): Point
  mag(): number
  equals(p: Point): boolean
  dist(p: Point): number
  distSqr(p: Point): number
  angle(): number
  angleTo(p: Point): number
  angleWith(p: Point): number
  static convert(a: [number, number] | Point): Point
}
export = Point
