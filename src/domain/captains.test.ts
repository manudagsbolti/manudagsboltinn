import { expect, it } from 'vitest'
import { randomCaptain, chooseRegularCaptain } from './captains'
it('draws equally sized intervals from only the team members',()=>{
  expect(randomCaptain(['a','b','c'],()=>0)).toBe('a')
  expect(randomCaptain(['a','b','c'],()=>0.5)).toBe('b')
  expect(randomCaptain(['a','b','c'],()=>0.999)).toBe('c')
  expect(()=>randomCaptain([])).toThrow()
})
it('only chooses regulars, avoids the previous captain when possible and leaves all-substitute teams unassigned',()=>{
  expect(chooseRegularCaptain(['sub','a','b'],['a','b'],'a',()=>0)).toBe('b')
  expect(chooseRegularCaptain(['sub','a'],['a'],'a',()=>0)).toBe('a')
  expect(chooseRegularCaptain(['sub'],['a'],undefined,()=>0)).toBeUndefined()
})
