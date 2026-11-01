import { expect, it } from 'vitest';
import { fitScale } from '../present/fit';
it('fits content down to the scrolling threshold', () => {
  expect(fitScale({width:1000,height:500},{width:1000,height:1000})).toEqual({scale:1,scroll:false});
  expect(fitScale({width:1000,height:1500},{width:1000,height:1000}).scale).toBeCloseTo(0.667, 3);
  expect(fitScale({width:1000,height:2000},{width:1000,height:1000})).toEqual({scale:0.6,scroll:true});
});
