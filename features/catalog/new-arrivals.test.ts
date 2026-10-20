import assert from "node:assert/strict";
import test from "node:test";
import { getNewArrivalCategoryGroups } from "./new-arrivals";

const category = (id: string, name: string, parentId: string | null = null) => ({
  id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), parentId,
});

test("groups eligible categories in order and excludes accessories and unrelated categories", () => {
  assert.deepEqual(getNewArrivalCategoryGroups([
    category("acc", "Accessories"), category("w", "Women’s Apparel"),
    category("s", "Court Shoes"), category("m", "Men's Apparel"),
    category("p", "Paddles"), category("b", "Balls"), category("a", "Apparel"),
  ]), [["p"], ["s"], ["m"], ["w"]]);
});

test("inherits category groups through multiple levels and keeps footwear ahead of apparel", () => {
  assert.deepEqual(getNewArrivalCategoryGroups([
    category("m", "Mens Apparel"), category("shirts", "Shirts", "m"),
    category("polos", "Polos", "shirts"), category("w", "Womens Apparel"),
    category("shoes", "Shoes", "w"), category("bags", "Bags", "w"),
    category("p", "Pro Paddles"), category("carbon", "Carbon", "p"),
  ]), [["p", "carbon"], ["shoes"], ["m", "shirts", "polos"], ["w"]]);
});

test("handles missing parents, cycles, and an empty catalog", () => {
  assert.deepEqual(getNewArrivalCategoryGroups([
    category("a", "Other", "b"), category("b", "Misc", "a"),
    category("c", "Unknown", "missing"),
  ]), [[], [], [], []]);
  assert.deepEqual(getNewArrivalCategoryGroups([]), [[], [], [], []]);
});
