import assert from 'node:assert/strict';
import test from 'node:test';
import { accountRemovalPlan, removeAccountAndServices } from '../src/features/settings/accountRemoval.ts';
test('account removal includes linked services, legacy borrowers, order and default model',()=>{
 const config:any={accounts:{target:{},keep:{}},providers:{a:{credential_id:'target'},b:{credential_id:'keep'}},search:{order:['direct','borrowed','keep'],providers:{direct:{credential_id:'target'},borrowed:{auth_provider:'a'},keep:{credential_id:'keep'}}},fetch:{order:['reader','keep'],providers:{reader:{credential_id:'target'},keep:{credential_id:'keep'}}},defaults:{provider:'a',model:'model',cwd:'/work'}};
 const before=structuredClone(config);
 assert.deepEqual(accountRemovalPlan(config,'target'),{models:['a'],searches:['direct','borrowed'],readers:['reader'],images:[],media:[],mcp:[],resetsDefault:true});
 assert.deepEqual(config,before,'planning does not delete anything');
 removeAccountAndServices(config,'target');
 assert.deepEqual(Object.keys(config.accounts),['keep']);assert.deepEqual(Object.keys(config.providers),['b']);
 assert.deepEqual(config.search.order,['keep']);assert.deepEqual(Object.keys(config.search.providers),['keep']);
 assert.deepEqual(config.fetch.order,['keep']);assert.deepEqual(Object.keys(config.fetch.providers),['keep']);
 assert.deepEqual(config.defaults,{provider:'',model:'',cwd:'/work'});
});
test('unlinked account deletion preserves all other configuration',()=>{
 const config:any={accounts:{target:{},keep:{}},providers:{b:{credential_id:'keep'}},defaults:{provider:'b',model:'model'}};
 removeAccountAndServices(config,'target');
 assert.deepEqual(config,{accounts:{keep:{}},providers:{b:{credential_id:'keep'}},defaults:{provider:'b',model:'model'}});
});
