import { createRequire } from "node:module";
import { expect, it } from "vitest";

// Test what Workbox's Rollup resolver actually loads, not just the vendor file.
const require = createRequire(import.meta.url);
const resolverRequire = createRequire(
  require.resolve("@rollup/plugin-node-resolve"),
);
const merge = resolverRequire("deepmerge");

function payload() {
  return JSON.parse('{"__proto__":{"poisoned":true},"safe":1}');
}

function expectSafe(result: object) {
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect("poisoned" in result).toBe(false);
  expect("poisoned" in {}).toBe(false);
}

it("Workbox resolves the explicitly named local security patch", () => {
  expect(resolverRequire("deepmerge/package.json")).toMatchObject({
    name: "deepmerge",
    version: "4.3.1-patch.0",
    "x-security-patch": "GHSA-gcqx-w48m-w2h4",
  });
});

it("does not poison a returned object while cloning a malicious target", () => {
  const result = merge(payload(), { other: 2 });
  expectSafe(result);
  expect(result.safe).toBe(1);
  expect(result.other).toBe(2);
  // Retain own data without invoking the inherited __proto__ setter.
  expect(Object.getOwnPropertyDescriptor(result, "__proto__")).toEqual({
    value: { poisoned: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
});

it("does not poison a returned object when the target has no prototype", () => {
  const result = merge(Object.create(null), payload());
  expectSafe(result);
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
});

it("does not poison a returned object when target owns __proto__", () => {
  const result = merge(payload(), payload());
  expectSafe(result);
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
});

it("retains the upstream guard against inherited source properties", () => {
  const result = merge({}, payload());
  expectSafe(result);
  expect(Object.hasOwn(result, "__proto__")).toBe(false);
  expect(result.safe).toBe(1);
});

it("protects nested objects and objects cloned inside arrays", () => {
  const result = merge(
    { nested: payload(), list: [payload()] },
    { extra: { nested: payload() }, list: [payload()] },
  );
  for (const value of [result.nested, result.extra.nested, ...result.list])
    expectSafe(value);
});

it("does not merge constructor/prototype data into Object.prototype", () => {
  const attack = JSON.parse('{"constructor":{"prototype":{"poisoned":true}}}');
  expectSafe(merge({}, attack));
  const result = merge(attack, attack);
  expectSafe(result);
  expect(Object.hasOwn(result, "constructor")).toBe(true);
  expect(result.constructor.prototype).toEqual({ poisoned: true });
});

it("preserves recursive merges, array concatenation, and input immutability", () => {
  const target = { nested: { a: 1 }, list: [{ a: 1 }] };
  const source = { nested: { b: 2 }, list: [{ b: 2 }] };
  const result = merge(target, source);
  expect(result).toEqual({
    nested: { a: 1, b: 2 },
    list: [{ a: 1 }, { b: 2 }],
  });
  expect(result.nested).not.toBe(target.nested);
  expect(result.list[0]).not.toBe(target.list[0]);
  expect(target).toEqual({ nested: { a: 1 }, list: [{ a: 1 }] });
  expect(source).toEqual({ nested: { b: 2 }, list: [{ b: 2 }] });
});

it("preserves enumerable symbol properties but not nonenumerable properties", () => {
  const symbol = Symbol("setting");
  const target = { [symbol]: { a: 1 } };
  Object.defineProperty(target, "hidden", { value: 1 });
  const result = merge(target, { [symbol]: { b: 2 } });
  expect(result[symbol]).toEqual({ a: 1, b: 2 });
  expect(Object.hasOwn(result, "hidden")).toBe(false);
});

it("preserves custom merging, custom array merging, and clone options", () => {
  expect(
    merge(
      { nested: { a: 1 } },
      { nested: { b: 2 } },
      { customMerge: () => (_a: object, b: object) => b },
    ),
  ).toEqual({ nested: { b: 2 } });
  expect(
    merge([1], [2], { arrayMerge: (_a: number[], b: number[]) => b }),
  ).toEqual([2]);
  const nested = { a: 1 };
  expect(merge({}, { nested }, { clone: false }).nested).toBe(nested);
});

it("preserves special values and the custom isMergeableObject option", () => {
  const date = new Date(0);
  const regexp = /example/;
  const react = { $$typeof: Symbol.for("react.element") };
  const result = merge({}, { date, regexp, react });
  expect(result.date).toBe(date);
  expect(result.regexp).toBe(regexp);
  expect(result.react).toBe(react);
  const nested = { a: 1 };
  expect(merge({}, { nested }, { isMergeableObject: () => false }).nested).toBe(
    nested,
  );
});

it("preserves merge.all and array/object replacement behavior", () => {
  expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  expect(() => merge.all({})).toThrow("first argument should be an array");
  expectSafe(merge.all([payload(), { b: 2 }]));
  expect(merge([], { a: 1 })).toEqual({ a: 1 });
  expect(merge({}, [1])).toEqual([1]);
});
