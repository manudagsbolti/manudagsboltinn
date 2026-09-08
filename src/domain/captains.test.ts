import { expect, it } from 'vitest'
import { randomCaptain } from './captains'
it('draws equally sized intervals from only the team members',()=>{
  expect(randomCaptain(['a','b','c'],()=>0)).toBe('a')
  expect(randomCaptain(['a','b','c'],()=>0.5)).toBe('b')
  expect(randomCaptain(['a','b','c'],()=>0.999)).toBe('c')
  expect(()=>randomCaptain([])).toThrow()
})
