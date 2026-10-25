import assert from 'node:assert/strict';
import test from 'node:test';
import {searchSettings} from '../src/features/settings/settingsSearch.ts';
const sections=[{id:'accounts',label:'账户',summary:'共享凭据',description:''},{id:'network',label:'网络',summary:'共用代理',description:''},{id:'service',label:'会话',summary:'默认配置',description:''}];
test('settings search finds Chinese options and English aliases across localized labels',()=>{
 assert.deepEqual(searchSettings(sections,'自动压缩').map(s=>s.id),['service']);
 assert.deepEqual(searchSettings(sections,'ＡＰＩ　ＫＥＹ').map(s=>s.id),['accounts']);
 assert.deepEqual(searchSettings(sections,'proxy URL').map(s=>s.id),['network']);
 assert.deepEqual(searchSettings(sections,'不存在的配置'),[]);
});
test('settings search keeps category order when empty and ranks direct category matches first',()=>{
 assert.deepEqual(searchSettings(sections,'   ').map(s=>s.id),sections.map(s=>s.id));
 const result=searchSettings([...sections,{id:'other',label:'代理',summary:'',description:''}],'代理');
 assert.equal(result[0]?.id,'other');
 assert.match(result.find(s=>s.id==='network')!.searchHint,/代理/);
});
