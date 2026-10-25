import assert from 'node:assert/strict';
import test from 'node:test';
import {compatibleAccounts,defaultAccount,fetchAccountPresets} from '../src/features/settings/accountCompatibility.ts';
test('reader accounts match platform rather than credential format',()=>{
 const accounts={anthropic:{preset:'anthropic',api_key:'<redacted>'},cn:{preset:'zhipu_coding_cn',api_key:'<redacted>'},empty:{preset:'zai_global'},zai:{preset:'zai_global',api_key_env:'ZAI_KEY'}};
 const allowed=fetchAccountPresets('zai_reader');
 assert.deepEqual(compatibleAccounts(accounts,allowed).map(([id])=>id),['empty','zai']);
 assert.equal(defaultAccount(accounts,allowed),'zai');
 assert.equal(defaultAccount(accounts,fetchAccountPresets('codex_fetch')),null);
 assert.equal(defaultAccount(accounts,[]),null);
});
test('credential presence does not confuse account metadata with a login',()=>{
 assert.equal(defaultAccount({missing:{preset:'openai_codex',credentials:{account_id:'123'}}},['openai_codex']),null);
 assert.equal(defaultAccount({login:{preset:'openai_codex',credentials:{refresh_token:'<redacted>'}}},['openai_codex']),'login');
});
