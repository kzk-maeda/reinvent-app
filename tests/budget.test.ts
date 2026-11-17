import {it,expect,afterEach} from 'vitest';
import { Store } from '../server/db.ts';import {Budget,month} from '../server/budget.ts';
const stores:Store[]=[];afterEach(()=>stores.splice(0).forEach(s=>s.close()));
it('reserves atomically, preserves unknown costs and settles exactly once',()=>{const s=new Store(':memory:');stores.push(s);const b=new Budget(s,10,150);const id=b.reserve('text','model',6);expect(()=>b.reserve('voice','model',5)).toThrow('予算');expect(b.snapshot().totalYen).toBe(6);b.confirm(id,.01,{});b.confirm(id,.02,{});expect(b.snapshot().totalYen).toBe(1.5);expect(()=>b.reserve('text','model',Number.NaN)).toThrow();expect(()=>b.reserve('text','model',-1)).toThrow();});
it('uses Japanese calendar months at UTC month boundaries',()=>{expect(month(new Date('2026-10-31T15:00:00Z'))).toContain('11');expect(month(new Date('2026-10-31T14:59:59Z'))).toContain('10');});
