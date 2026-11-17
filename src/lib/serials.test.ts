import { describe,expect,it } from 'vitest';
import { serialCandidates } from './serials';
describe('optional serial OCR suggestions',()=>{
 it('reads serial lines but not ordinary model labels',()=>{
   expect(serialCandidates('S/N: A1234BB78\nModel: S90FD')).toEqual(['A1234BB78']);
 });
 it('requires explicit prefix and deduplicates suggestions',()=>{
   expect(serialCandidates('SN: TV-1A34\nSERIAL: TV-1A34\nUPC: 012345678901')).toEqual(['TV-1A34']);
 });
 it('never guesses a model as a unique serial',()=>{
   expect(serialCandidates('S90FD\nMODEL: S90FD\n123456789')).toEqual([]);
 });
});
