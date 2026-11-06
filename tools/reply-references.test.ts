import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderedUserContent,userBubbles} from '../src/core/api/userContent.ts';
import {referenceDescription,type ReplyReference} from '../src/core/replyReferences.ts';
import {splitAttachmentText} from '../src/core/attachmentPlaceholders.ts';
const ref:ReplyReference={id:'a'.repeat(64),session:'s',source:'message_42',seq:42,block:0,start:27,end:35,text:'**same**',label:'same'};
test('sent references retain atomic display chips without expanding source Markdown into the user bubble',()=>{
 const token=`<reply-${ref.id}>`;
 const content=orderedUserContent({metadata:{custom:{reply_draft:`Explain ${token}`,reply_references:[ref]},attachments:[],input_parts:[]}},'s',[]);
 assert.deepEqual(content,[{type:'text',text:'Explain '},{type:'reply',reference:ref}]);
 assert.deepEqual(userBubbles(content),content);
 assert.deepEqual(splitAttachmentText(`before ${token} after`,[{placeholder:token}]).map(p=>p.type),['text','attachment','text']);
 assert.equal(splitAttachmentText(token,[])[0]?.type,'text','unrecognized tokens are never invented as references');
});
test('media reference descriptions identify file, page, source geometry and coordinate origin',()=>{
 const media={...ref,blob:'b'.repeat(64),page:7,label:'paper.pdf',region:{x:10,y:20,width:100,height:80,sourceWidth:300,sourceHeight:400,unit:'pt' as const}};
 const description=referenceDescription(media);
 assert.match(description,/paper.pdf/);assert.match(description,/page=7/);assert.match(description,/top-left, pt/);assert.match(description,/"sourceWidth":300/);
 assert.match(referenceDescription(ref),/source range 27:35/);assert.match(referenceDescription(ref),/> \*\*same\*\*/);
});
