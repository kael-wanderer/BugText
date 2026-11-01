import { expect, it } from 'vitest';
import { createKeyReader } from '../present/keys';
it('reads navigation, buffered numbers, chords and repeats', () => {
  let now = 0; const { read } = createKeyReader(() => now);
  expect(read({key:'p', metaKey:true})).toBeNull();
  expect(read({key:'3'})).toBeNull(); expect(read({key:'1'})).toBeNull();
  expect(read({key:'Enter'})).toEqual({goto:31});
  expect(read({key:'Enter'})).toBe('next');
  read({key:'5'}); now += 1600; expect(read({key:'Enter'})).toBe('next');
  expect(read({key:'b', repeat:true})).toBeNull();
});
