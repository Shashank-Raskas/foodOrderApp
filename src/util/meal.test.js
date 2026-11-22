import { isVegMeal, matchesProteinFilter } from './meal';

describe('matchesProteinFilter', () => {
  it('"Beef / Lamb" and "Fish / Seafood" each match both stored values', () => {
    expect(matchesProteinFilter(['beef'], 'lamb')).toBe(true);
    expect(matchesProteinFilter(['beef'], 'beef')).toBe(true);
    expect(matchesProteinFilter(['fish'], 'seafood')).toBe(true);
    expect(matchesProteinFilter(['fish'], 'fish')).toBe(true);
    expect(matchesProteinFilter(['beef'], 'chicken')).toBe(false);
  });

  it('other options match exactly; several options combine; nothing ticked matches all', () => {
    expect(matchesProteinFilter(['egg'], 'egg')).toBe(true);
    expect(matchesProteinFilter(['egg'], 'vegetarian')).toBe(false);
    expect(matchesProteinFilter(['chicken', 'fish'], 'seafood')).toBe(true);
    expect(matchesProteinFilter([], 'pork')).toBe(true);
    expect(matchesProteinFilter(undefined, 'pork')).toBe(true);
  });
});

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
