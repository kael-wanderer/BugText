import { expect, it } from 'vitest';
import { parsePresenterCommand, parsePresenterState } from '../present/protocol';
it('validates state and commands', () => {
 const state = {index:2,total:12,current:'# Here',next:'# Next',notes:'<img>',notePath:null,theme:'dark',notesSize:20,owner:'main'};
 expect(parsePresenterState(state)).toEqual(state);
 for (const patch of [{index:12},{index:-1},{current:7},{notesSize:99}]) expect(parsePresenterState({...state,...patch})).toBeNull();
 expect(parsePresenterCommand({action:'next'})).toEqual({action:'next'});
 expect(parsePresenterCommand({action:'unknown'})).toBeNull();
});
