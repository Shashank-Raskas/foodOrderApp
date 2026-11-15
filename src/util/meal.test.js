import { isVegMeal } from './meal';

describe('isVegMeal', () => {
  it('uses the protein field when there is one', () => {
    expect(isVegMeal({ protein: 'vegetarian' })).toBe(true);
    expect(isVegMeal({ protein: 'chicken' })).toBe(false);
    expect(isVegMeal({ protein: 'egg', dietary: ['vegetarian'] })).toBe(false);
  });

  it('falls back to the dietary tags', () => {
    expect(isVegMeal({ dietary: ['vegan'] })).toBe(true);
    expect(isVegMeal({ dietary: ['gluten-free'] })).toBe(false);
    expect(isVegMeal(null)).toBe(false);
  });
});
